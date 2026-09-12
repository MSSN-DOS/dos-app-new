import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { semesterSettings } from "@/lib/db/schema/semester";
import {
  semesterSettingsUpdateSchema,
  type SemesterSettingsUpdate,
} from "@/lib/validation/semester-settings";

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

/**
 * GET /api/admin/settings/semester — reads the single-row semester_settings
 * table (DESIGN.md §8). Sane default when the row has never been written.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const rows = await db
      .select({
        mode: semesterSettings.mode,
        manualOverride: semesterSettings.manualOverride,
        updatedAt: semesterSettings.updatedAt,
      })
      .from(semesterSettings)
      .where(eq(semesterSettings.id, 1))
      .limit(1);

    return NextResponse.json({
      data: rows[0] ?? { mode: "auto", manualOverride: null, updatedAt: null },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}

/** PATCH — upserts the single row; auto mode clears a stale override. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await requireAuth(request, ["admin"]);
    const db = getDb();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = null;
    }
    const parsed = semesterSettingsUpdateSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    const input: SemesterSettingsUpdate = parsed.data;
    const values = {
      mode: input.mode,
      // Auto mode ignores the override entirely — clear it so the stored row
      // never implies a stale override is in force. Manual mode always has
      // one (enforced by the schema).
      manualOverride:
        input.mode === "manual" ? input.manualOverride ?? null : null,
      updatedAt: new Date(),
      updatedBy: session.userId,
    };

    const rows = await db
      .insert(semesterSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({
        target: semesterSettings.id,
        set: values,
      })
      .returning({
        mode: semesterSettings.mode,
        manualOverride: semesterSettings.manualOverride,
        updatedAt: semesterSettings.updatedAt,
      });

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
