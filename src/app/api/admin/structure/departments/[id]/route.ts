import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { courses, departmentLevels, departments, studentProfiles } from "@/lib/db/schema";
import { departmentUpdateSchema } from "@/lib/validation/structure";

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

    const data = departmentUpdateSchema.parse(await request.json());
    const levelIds = [...new Set(data.levelIds)];

    const db = getDb();
    const [row] = await db
      .update(departments)
      .set({ name: data.name, facultyId: data.facultyId })
      .where(eq(departments.id, id))
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        { status: 404 },
      );
    }

    // Set-replace the level links — not incremental add/remove calls.
    await db
      .delete(departmentLevels)
      .where(eq(departmentLevels.departmentId, id))
      .returning();
    await db
      .insert(departmentLevels)
      .values(levelIds.map((levelId) => ({ departmentId: id, levelId })))
      .returning();

    return NextResponse.json({ ...row, levelIds });
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
    // Block deletion while anything references the department. The department_levels
    // links cascade at the DB level; courses and student profiles do not.
    const [courseRef] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.departmentId, id))
      .limit(1);
    if (courseRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Department is used by one or more courses and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [studentRef] = await db
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(eq(studentProfiles.departmentId, id))
      .limit(1);
    if (studentRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Department has one or more students and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db.delete(departments).where(eq(departments.id, id)).returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
