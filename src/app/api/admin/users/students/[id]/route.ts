import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  bestScores,
  cgpaRecords,
  courses,
  departments,
  faculties,
  levels,
  postUtmeScores,
  quizAttempts,
  quizzes,
  roles,
  studentProfiles,
  tourCompletions,
  users,
} from "@/lib/db/schema";
import { studentDeleteSchema, studentUpdateSchema } from "@/lib/validation/users";

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

function parseStudentId(raw: string): number | undefined {
  if (!/^[0-9]+$/.test(raw)) return;
  const id = Number(raw);
  if (id >= 1 && id <= 2_147_483_647) return id;
}

function badId(): NextResponse {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
    { status: 400 },
  );
}

const notFound = () =>
  NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Student not found" } },
    { status: 404 },
  );

/**
 * Confirms the id names a Student specifically — never reuses the id as "some user". Shared by
 * PATCH and DELETE so neither can act on a Teacher/Admin by guessing a number.
 */
async function findStudent(
  db: ReturnType<typeof getDb>,
  id: number,
): Promise<{ id: number; fullName: string; identifier: string } | undefined> {
  const [row] = await db
    .select({ id: users.id, fullName: users.fullName, identifier: users.identifier })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.id, id), eq(roles.name, "student")))
    .limit(1);
  return row;
}

/** GET /api/admin/users/students/[id] — profile + performance drill-down. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = parseStudentId((await params).id);
    if (id === undefined) return badId();

    const db = getDb();
    const [student] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        departmentName: departments.name,
        facultyName: faculties.name,
        levelValue: levels.value,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .leftJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .leftJoin(faculties, eq(departments.facultyId, faculties.id))
      .leftJoin(levels, eq(studentProfiles.levelId, levels.id))
      .where(and(eq(users.id, id), eq(roles.name, "student")))
      .limit(1);

    if (!student) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Student not found" } },
        { status: 404 },
      );
    }

    const cgpaHistory = await db
      .select({ weekStart: cgpaRecords.weekStart, cgpaValue: cgpaRecords.cgpaValue })
      .from(cgpaRecords)
      .where(eq(cgpaRecords.userId, id))
      .orderBy(desc(cgpaRecords.weekStart));

    const attempts = await db
      .select({
        attemptId: quizAttempts.id,
        quizId: quizzes.id,
        quizTitle: quizzes.title,
        quizType: quizzes.quizType,
        courseCode: courses.code,
        attemptNumber: quizAttempts.attemptNumber,
        score: quizAttempts.score,
        submittedAt: quizAttempts.submittedAt,
        releasedAt: quizAttempts.releasedAt,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .where(eq(quizAttempts.userId, id))
      .orderBy(desc(quizAttempts.submittedAt), asc(quizAttempts.id));

    const normalize = (v: string) => {
      const n = Number(v);
      return n > 5 ? Math.min(5, n / 20).toFixed(2) : v;
    };
    return NextResponse.json({
      student,
      currentCgpa: cgpaHistory[0]?.cgpaValue ? normalize(cgpaHistory[0].cgpaValue) : null,
      quizzesTaken: new Set(attempts.map((a) => a.quizId)).size,
      attempts,
      cgpaHistory: cgpaHistory.map((r) => ({ ...r, cgpaValue: normalize(r.cgpaValue) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PATCH /api/admin/users/students/[id]
 *
 * The deactivate/reactivate switch, and nothing else (DESIGN.md §7a). Deactivating is the
 * reversible option: attempts, scores and CGPA stay exactly as they were, and because
 * `requireAuth()` re-reads the account, the student's existing token stops working immediately
 * rather than at its 7-day expiry.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = parseStudentId((await params).id);
    if (id === undefined) return badId();

    const data = studentUpdateSchema.parse(await request.json());
    const db = getDb();

    const student = await findStudent(db, id);
    if (!student) return notFound();

    const [row] = await db
      .update(users)
      .set({ isActive: data.isActive })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
      });

    if (!row) return notFound();
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

/**
 * DELETE /api/admin/users/students/[id]
 *
 * Hard-deletes a Student. Unlike Teacher deletion there is nothing here that legitimately blocks
 * it — a Student authors no quizzes, questions, topics or content. Held (unreleased) attempts do
 * not block it either: once the attempt is gone, an unreleased score has nobody to be released to.
 *
 * The transaction removes every `users.id` reference without a cascade, in FK order, then the user
 * row itself (`student_profiles`, `aspirant_profiles`, `user_preferences` and `sessions` cascade).
 * Rankings are computed live from `cgpa_records`, so past-week leaderboard standings change
 * retroactively — accepted, and called out in the confirm dialog rather than papered over.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAuth(request, ["admin"]);
    const id = parseStudentId((await params).id);
    if (id === undefined) return badId();

    const db = getDb();
    const student = await findStudent(db, id);
    if (!student) return notFound();

    const confirmation = studentDeleteSchema.parse(await request.json().catch(() => null));
    if (confirmation.identifier.toLowerCase() !== student.identifier.toLowerCase()) {
      return NextResponse.json(
        { error: { code: "CONFIRMATION_MISMATCH", message: "Enter the student's current identifier" } },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      // attempt_answers cascade off quiz_attempts.
      await tx.delete(quizAttempts).where(eq(quizAttempts.userId, id));
      await tx.delete(bestScores).where(eq(bestScores.userId, id));
      await tx.delete(cgpaRecords).where(eq(cgpaRecords.userId, id));
      await tx.delete(postUtmeScores).where(eq(postUtmeScores.userId, id));
      await tx.delete(tourCompletions).where(eq(tourCompletions.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });

    // TODO(needs-board-decision): no audit-trail table exists yet. Record the actor so a deletion
    // is at least traceable in server logs until the Board decides on a real audit mechanism.
    console.log(
      `[audit] student hard-deleted: actor=${actor.userId} student=${id} at=${new Date().toISOString()}`,
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
