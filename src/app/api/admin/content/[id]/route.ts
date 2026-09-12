import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { removeResourceObject } from "@/lib/storage/supabase-storage";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const { id } = await ctx.params;
    const contentId = Number(id);
    if (!Number.isInteger(contentId) || contentId <= 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 422 },
      );
    }

    const db = getDb();
    const [row] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, contentId))
      .limit(1);
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Content item not found" } },
        { status: 404 },
      );
    }

    // PDFs also remove their Storage object; articles have nothing stored there.
    if (row.type === "pdf") {
      await removeResourceObject(row.bodyOrFileUrl);
    }

    await db.delete(contentItems).where(eq(contentItems.id, contentId));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
