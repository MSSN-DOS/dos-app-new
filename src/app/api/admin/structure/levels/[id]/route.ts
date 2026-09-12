import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { departmentLevels, levels, studentProfiles } from "@/lib/db/schema";
import { levelUpdateSchema } from "@/lib/validation/structure";

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
    const data = levelUpdateSchema.parse(json);

    const db = getDb();
    const [row] = await db
      .update(levels)
      .set({ value: data.value })
      .where(eq(levels.id, id))
      .returning();

    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Level not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(row);
  } catch (err) {
    // Unique-violation from a concurrent insert of the same value.
    if (err instanceof Error && "code" in err && err.code === "23505") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A level with that value already exists" } },
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
    // Block deletion when anything references the level — the FKs would fail anyway;
    // this returns a readable reason instead of a raw DB error.
    const [deptRef] = await db
      .select({ departmentId: departmentLevels.departmentId })
      .from(departmentLevels)
      .where(eq(departmentLevels.levelId, id))
      .limit(1);
    if (deptRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Level is in use by one or more departments and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [profileRef] = await db
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(eq(studentProfiles.levelId, id))
      .limit(1);
    if (profileRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Level is assigned to one or more students and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db.delete(levels).where(eq(levels.id, id)).returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Level not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
