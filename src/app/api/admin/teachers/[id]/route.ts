import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { teacherUpdateSchema } from "@/lib/validation/teachers";

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

// Deactivate/reactivate only — never hard-delete. Quiz/question authorship references
// the user row, so deleting a Teacher would break authored content (DESIGN.md §7).
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
    const data = teacherUpdateSchema.parse(json);

    const [row] = await getDb()
      .update(users)
      .set({ isActive: data.isActive })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
      });

    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Teacher not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
