import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { academicSessions } from "@/lib/db/schema/academic-sessions";
import { semesterSettings } from "@/lib/db/schema/semester";
import { getActiveSemester } from "@/lib/semester";
import {
  semesterSettingsUpdateSchema,
  type SemesterSettingsUpdate,
} from "@/lib/validation/semester-settings";

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
        manualOverrideSessionId: semesterSettings.manualOverrideSessionId,
        updatedAt: semesterSettings.updatedAt,
      })
      .from(semesterSettings)
      .where(eq(semesterSettings.id, 1))
      .limit(1);

    const settings = rows[0] ?? {
      mode: "auto",
      manualOverride: null,
      manualOverrideSessionId: null,
      updatedAt: null,
    };

    // The *resolved* pair, computed by the one resolver every other consumer uses.
    //
    // This exists because two admin screens used to re-derive it client-side with
    // `pickSessionForDate(sessions, new Date())`, which (a) broke AGENTS.md §3 — resolution is
    // only ever allowed through `getActiveSemester()` — and (b) silently ignored the manual
    // override, so a course pinned to Rain still badged "Active" while an Admin had Harmattan
    // forced. One server answer removes both. `no-session` is passed through as null rather than
    // guessed at, which is what lets the UI say so instead of highlighting the wrong course.
    const resolved = await getActiveSemester(db);
    const active = resolved.ok
      ? {
          semester: resolved.semester,
          sessionId: resolved.sessionId,
          sessionLabel: resolved.sessionLabel,
          source: resolved.source,
        }
      : null;

    return NextResponse.json({ data: { ...settings, active } });
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
    if (!parsed.success) return errorResponse(parsed.error);

    const input: SemesterSettingsUpdate = parsed.data;

    // The override session must exist, otherwise the setting resolves to a session with no
    // dates and every course filter matches nothing — a silent total blackout, which is a much
    // worse failure than a 404 at save time.
    if (input.mode === "manual" && input.manualOverrideSessionId != null) {
      const [target] = await db
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(eq(academicSessions.id, input.manualOverrideSessionId))
        .limit(1);
      if (!target) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: `Academic session ${input.manualOverrideSessionId} not found`,
            },
          },
          { status: 404 },
        );
      }
    }

    const values = {
      mode: input.mode,
      // Auto mode ignores the override entirely — clear both halves so the stored row never
      // implies a stale override is in force (the DB CHECK requires the pair to be all-or-none).
      // Manual mode always has both (enforced by the schema above).
      manualOverride: input.mode === "manual" ? (input.manualOverride ?? null) : null,
      manualOverrideSessionId:
        input.mode === "manual" ? (input.manualOverrideSessionId ?? null) : null,
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
        manualOverrideSessionId: semesterSettings.manualOverrideSessionId,
        updatedAt: semesterSettings.updatedAt,
      });

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
