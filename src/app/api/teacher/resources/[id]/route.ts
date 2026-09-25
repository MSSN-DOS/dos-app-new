import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { videoUpdateSchema } from "@/lib/validation/content";

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

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

// A factory, not a shared constant: a Response body can only be read once, so handing the
// same instance to two requests would fail on the second one.
function notFound(): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Video link not found" } },
    { status: 404 },
  );
}

/**
 * PATCH /api/teacher/resources/[id] — fix a title or a wrong URL.
 *
 * Title and URL only; scope is fixed at creation (see `videoUpdateSchema`). A non-owner gets
 * 404 rather than 403, matching `/api/teacher/quizzes/[id]`, so the route doesn't confirm
 * that another Teacher's link exists.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const input = videoUpdateSchema.parse(await request.json());
    const db = getDb();

    const [existing] = await db
      .select({
        id: contentItems.id,
        type: contentItems.type,
        uploadedBy: contentItems.uploadedBy,
      })
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);

    if (
      !existing ||
      existing.type !== "video" ||
      !forbiddenUnlessOwned(auth, existing.uploadedBy)
    ) {
      return notFound();
    }

    const [row] = await db
      .update(contentItems)
      .set({ title: input.title, bodyOrFileUrl: input.url })
      .where(eq(contentItems.id, id))
      .returning();

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

/** DELETE /api/teacher/resources/[id] — remove a link. Nothing references content_items. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();

    const [existing] = await db
      .select({
        id: contentItems.id,
        type: contentItems.type,
        uploadedBy: contentItems.uploadedBy,
      })
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);

    if (
      !existing ||
      existing.type !== "video" ||
      !forbiddenUnlessOwned(auth, existing.uploadedBy)
    ) {
      return notFound();
    }

    await db.delete(contentItems).where(eq(contentItems.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
