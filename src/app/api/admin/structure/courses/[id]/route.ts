import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  contentItems,
  courseFaculties,
  courses,
  questions,
  quizzes,
} from "@/lib/db/schema";
import { courseUpdateSchema, type CourseCreateInput } from "@/lib/validation/structure";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const data = courseUpdateSchema.parse(await request.json());
    const facultyIds =
      data.scopeType === "interfaculty" ? [...new Set(data.facultyIds ?? [])] : [];

    const db = getDb();
    const [row] = await db
      .update(courses)
      .set({
        code: data.code,
        title: data.title,
        levelId: data.levelId,
        semester: data.semester,
        scopeType: data.scopeType,
        ...scopeColumns(data),
      })
      .where(eq(courses.id, id))
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Course not found" } },
        { status: 404 },
      );
    }

    // Set-replace the interfaculty faculty links — not incremental add/remove calls.
    await db
      .delete(courseFaculties)
      .where(eq(courseFaculties.courseId, id))
      .returning();
    if (facultyIds.length > 0) {
      await db
        .insert(courseFaculties)
        .values(facultyIds.map((facultyId) => ({ courseId: id, facultyId })))
        .returning();
    }

    return NextResponse.json({ ...row, facultyIds });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();
    // Block deletion while anything references the course. The course_faculties links
    // cascade at the DB level; quizzes, questions and content items do not.
    const [quizRef] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.courseId, id))
      .limit(1);
    if (quizRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Course has one or more quizzes and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [questionRef] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.courseId, id))
      .limit(1);
    if (questionRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Course has one or more questions in the bank and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [contentRef] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(eq(contentItems.courseId, id))
      .limit(1);
    if (contentRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Course has one or more content items attached and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db.delete(courses).where(eq(courses.id, id)).returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Course not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
