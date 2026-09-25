import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { hashPassword } from "@/lib/auth/password";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  courses,
  jambSubjects,
  quizzes,
  roles,
  teacherSubjects,
  users,
} from "@/lib/db/schema";
import { generateInitialPassword } from "@/lib/teachers/password";
import { formatStaffId, nextStaffId, nextStaffNumber } from "@/lib/teachers/staff-id";
import { teacherCreateSchema } from "@/lib/validation/teachers";

function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "body",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

// Two Admins creating a Teacher at the same moment can generate the same STF number. The
// unique index on users.identifier catches it; we re-derive and retry rather than fail.
const MAX_ID_ATTEMPTS = 3;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const pagination = parsePagination(new URL(request.url).searchParams);
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(roles.name, "teacher"))
      .orderBy(asc(users.fullName));

    // Published-quiz counts per teacher, for the list row ("N quizzes published").
    // Fetched as flat rows and counted in JS — no GROUP BY needed at this scale.
    const published = await db
      .select({ createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.status, "published"))
      .orderBy(asc(quizzes.createdBy));
    const counts = new Map<number, number>();
    for (const p of published) {
      counts.set(p.createdBy, (counts.get(p.createdBy) ?? 0) + 1);
    }

    // What each teacher is allowed to author. Same flat-rows-grouped-in-JS approach; only
    // teachers ever have assignment rows, so no role filter is needed here.
    const assignments = await db
      .select({
        userId: teacherSubjects.userId,
        courseCode: courses.code,
        jambSubjectName: jambSubjects.name,
      })
      .from(teacherSubjects)
      .leftJoin(courses, eq(teacherSubjects.courseId, courses.id))
      .leftJoin(jambSubjects, eq(teacherSubjects.jambSubjectId, jambSubjects.id))
      .orderBy(asc(teacherSubjects.userId));

    const subjects = new Map<number, string[]>();
    for (const a of assignments) {
      const label = a.courseCode ?? a.jambSubjectName;
      if (!label) continue;
      const list = subjects.get(a.userId) ?? [];
      list.push(label);
      subjects.set(a.userId, list);
    }

    const data = rows.map((row) => ({
      ...row,
      publishedQuizzes: counts.get(row.id) ?? 0,
      subjects: subjects.get(row.id) ?? [],
    }));
    return NextResponse.json(paginate(data, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/admin/teachers
 *
 * Creates a Teacher with a generated staff ID (STF-001, ...) and a generated initial password,
 * assigned to the courses and/or JAMB subjects the Admin picked.
 *
 * The plaintext password appears in this response and **never again** — it is only ever stored
 * hashed, and no other endpoint returns it. The Admin copies it from the one-time modal.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const data = teacherCreateSchema.parse(await request.json());
    const db = getDb();

    const courseIds = [...new Set(data.courseIds ?? [])];
    const jambSubjectIds = [...new Set(data.jambSubjectIds ?? [])];

    // Verify every referenced row exists before creating anything.
    const courseRows =
      courseIds.length > 0
        ? await db
            .select({ id: courses.id, code: courses.code, title: courses.title })
            .from(courses)
            .where(inArray(courses.id, courseIds))
            .orderBy(asc(courses.id))
        : [];
    if (courseRows.length !== courseIds.length) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "One or more courses were not found" } },
        { status: 404 },
      );
    }

    const subjectRows =
      jambSubjectIds.length > 0
        ? await db
            .select({ id: jambSubjects.id, name: jambSubjects.name })
            .from(jambSubjects)
            .where(inArray(jambSubjects.id, jambSubjectIds))
            .orderBy(asc(jambSubjects.id))
        : [];
    if (subjectRows.length !== jambSubjectIds.length) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "One or more JAMB subjects were not found" } },
        { status: 404 },
      );
    }

    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "teacher"))
      .limit(1);
    if (!role) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Unknown role" } },
        { status: 422 },
      );
    }

    const initialPassword = generateInitialPassword();
    const passwordHash = await hashPassword(initialPassword);

    // 'staff_id' is the identifier namespace for staff accounts generally, so an Admin's own
    // STF-style id would only make the sequence skip a number — never collide.
    const identifierRows = await db
      .select({ identifier: users.identifier })
      .from(users)
      .where(eq(users.identifierType, "staff_id"))
      .orderBy(asc(users.identifier));
    const takenIdentifiers = identifierRows.map((row) => row.identifier);

    const assignmentValues = (userId: number) => [
      ...courseIds.map((courseId) => ({ userId, courseId, jambSubjectId: null })),
      ...jambSubjectIds.map((jambSubjectId) => ({ userId, courseId: null, jambSubjectId })),
    ];

    let identifier = nextStaffId(takenIdentifiers);
    let created:
      | { id: number; fullName: string; identifier: string; isActive: boolean }
      | undefined;

    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      try {
        created = await db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({
              roleId: role.id,
              fullName: data.fullName,
              identifier,
              identifierType: "staff_id",
              passwordHash,
            })
            .returning({
              id: users.id,
              fullName: users.fullName,
              identifier: users.identifier,
              isActive: users.isActive,
            });

          if (!user) throw new Error("Teacher insert returned no row");

          const values = assignmentValues(user.id);
          if (values.length > 0) {
            await tx.insert(teacherSubjects).values(values);
          }
          return user;
        });
        break;
      } catch (e) {
        // Only an identifier collision is retryable. Anything else is a real failure.
        if (!isUniqueViolation(e) || attempt === MAX_ID_ATTEMPTS - 1) throw e;
        identifier = formatStaffId(nextStaffNumber([...takenIdentifiers, identifier]));
      }
    }

    if (!created) throw new Error("Could not allocate a staff ID");

    return NextResponse.json(
      {
        teacher: created,
        // Shown once, on create. Never persisted in plaintext, never returned again.
        initialPassword,
        courses: courseRows,
        jambSubjects: subjectRows,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
