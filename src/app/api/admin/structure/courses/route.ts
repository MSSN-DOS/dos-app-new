import { asc, and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { courseFaculties, courses } from "@/lib/db/schema";
import { courseCreateSchema, type CourseCreateInput } from "@/lib/validation/structure";

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

// Map the validated body onto the stored columns, mirroring courses_scope_check.
function scopeColumns(data: CourseCreateInput) {
  return {
    departmentId: data.scopeType === "department" ? (data.departmentId ?? null) : null,
    facultyId: data.scopeType === "faculty" ? (data.facultyId ?? null) : null,
  };
}

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
    const params = new URL(request.url).searchParams;
    const departmentIdParam = params.get("departmentId");
    const levelIdParam = params.get("levelId");
    const semester = params.get("semester");
    const departmentId = departmentIdParam === null ? null : Number(departmentIdParam);
    const levelId = levelIdParam === null ? null : Number(levelIdParam);
    const db = getDb();
    const rows = await db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        levelId: courses.levelId,
        semester: courses.semester,
        scopeType: courses.scopeType,
        departmentId: courses.departmentId,
        facultyId: courses.facultyId,
      })
      .from(courses)
      .orderBy(asc(courses.code));
    const links = await db
      .select({
        courseId: courseFaculties.courseId,
        facultyId: courseFaculties.facultyId,
      })
      .from(courseFaculties)
      .orderBy(asc(courseFaculties.courseId));

    const facultyIdsByCourse = new Map<number, number[]>();
    for (const link of links) {
      const ids = facultyIdsByCourse.get(link.courseId) ?? [];
      ids.push(link.facultyId);
      facultyIdsByCourse.set(link.courseId, ids);
    }

    const data = rows
      .filter(
        (row) =>
          (departmentId === null || row.departmentId === departmentId) &&
          (levelId === null || row.levelId === levelId) &&
          (semester === null || row.semester === semester),
      )
      .map((row) => ({
        ...row,
        facultyIds: facultyIdsByCourse.get(row.id) ?? [],
      }));
    return NextResponse.json(paginate(data, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const data = courseCreateSchema.parse(await request.json());
    const facultyIds =
      data.scopeType === "interfaculty" ? [...new Set(data.facultyIds ?? [])] : [];

    const db = getDb();
    // No DB uniqueness on courses — keep the same code + level + semester combination
    // out with a readable conflict instead (same approach as departments).
    const [existing] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.code, data.code),
          eq(courses.levelId, data.levelId),
          eq(courses.semester, data.semester),
        ),
      )
      .limit(1);
    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Course "${data.code}" already exists at this level for this semester`,
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(courses)
      .values({
        code: data.code,
        title: data.title,
        levelId: data.levelId,
        semester: data.semester,
        scopeType: data.scopeType,
        ...scopeColumns(data),
      })
      .returning();

    if (facultyIds.length > 0) {
      await db
        .insert(courseFaculties)
        .values(facultyIds.map((facultyId) => ({ courseId: row.id, facultyId })))
        .returning();
    }

    return NextResponse.json({ ...row, facultyIds }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
