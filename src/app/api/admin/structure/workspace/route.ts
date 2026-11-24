import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { courseErrorResponse } from "@/lib/api/course-error";
import {
  structureWorkspace,
  structureOperation,
  StructureConflict,
} from "@/lib/db/structure-workspace";
import {
  workspaceQuerySchema,
  workspaceOperationSchema,
} from "@/lib/validation/structure-workspace";
function failure(error: unknown) {
  if (error instanceof StructureConflict)
    return NextResponse.json(
      { error: { code: "CONFLICT", message: error.message } },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
      },
      { status: 422 },
    );
  return courseErrorResponse(error);
}
export async function GET(request: Request) {
  try {
    await requireAuth(request, ["admin"]);
    const input = workspaceQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json({ data: await structureWorkspace(input) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAuth(request, ["admin"]);
    const input = workspaceOperationSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(
      { data: await structureOperation(input, actor.userId) },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
