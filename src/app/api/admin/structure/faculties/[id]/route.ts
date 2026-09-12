import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { courseFaculties, courses, departments, faculties } from "@/lib/db/schema";
import { facultyUpdateSchema } from "@/lib/validation/structure";

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

    const json = await request.json();
    const data = facultyUpdateSchema.parse(json);

    const db = getDb();
    const [row] = await db
      .update(faculties)
      .set({ name: data.name })
      .where(eq(faculties.id, id))
      .returning();

    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Faculty not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(row);
  } catch (err) {
    // Unique-violation from a concurrent insert of the same name.
    if (err instanceof Error && "code" in err && err.code === "23505") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A faculty with that name already exists" } },
        { status: 409 },
      );
    }
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
    // Block deletion while anything references the faculty — the FKs would fail anyway;
    // this returns a readable reason instead of a raw DB error.
    const [deptRef] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.facultyId, id))
      .limit(1);
    if (deptRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Faculty has one or more departments and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [courseRef] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.facultyId, id))
      .limit(1);
    if (courseRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Faculty is used by one or more courses and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [courseFacultyRef] = await db
      .select({ courseId: courseFaculties.courseId })
      .from(courseFaculties)
      .where(eq(courseFaculties.facultyId, id))
      .limit(1);
    if (courseFacultyRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Faculty is linked to one or more interfaculty courses and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db.delete(faculties).where(eq(faculties.id, id)).returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Faculty not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
