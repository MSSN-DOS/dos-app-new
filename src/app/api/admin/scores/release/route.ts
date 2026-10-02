import { and, asc, eq, isNotNull, isNull, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizAttempts, quizzes } from "@/lib/db/schema";
import { recomputeWeeklyScores } from "@/lib/scoring/apply-release";
import { releaseSchema, type ReleaseInput } from "@/lib/validation/scores";

class NotFoundError extends Error {}

async function releaseHeldAttempts(
  db: ReturnType<typeof getDb>,
  input: ReleaseInput,
): Promise<{ releasedCount: number; weeks: string[]; userIds: number[] }> {
  const heldRows = await db
    .select({
      id: quizAttempts.id,
      userId: quizAttempts.userId,
      weekStart: quizzes.weekStart,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        isNotNull(quizAttempts.submittedAt),
        isNull(quizAttempts.releasedAt),
        "quizId" in input
          ? eq(quizAttempts.quizId, input.quizId)
          : eq(quizzes.weekStart, input.weekStart),
      ),
    )
    .orderBy(asc(quizAttempts.id));

  if (heldRows.length === 0) {
    throw new NotFoundError();
  }

  const attemptIds = heldRows.map((row) => row.id);
  await db
    .update(quizAttempts)
    .set({ releasedAt: new Date() })
    .where(inArray(quizAttempts.id, attemptIds));

  return {
    releasedCount: attemptIds.length,
    // Only weeked quizzes can affect a weekly score. A Topic Quiz has `weekStart = NULL`, and
    // passing that through would put `null` into a value typed as a date, then render it as
    // `week_start = $1` with a null parameter — a query SQL never matches, so it would burn a
    // round-trip per null while silently recomputing nothing. Filtering here is also the correct
    // outcome on the merits: Topic Quiz results never feed CGPA or Post-UTME (AGENTS.md §3), so
    // there is nothing to recompute for them.
    weeks: [...new Set(heldRows.map((row) => row.weekStart).filter((week) => week !== null))],
    userIds: [...new Set(heldRows.map((row) => row.userId))],
  };
}

/** POST /api/admin/scores/release — {quizId} or {weekStart}; recomputes CGPA + Post-UTME. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error);

    // Release first, then recompute every affected (user, week) pair synchronously.
    const { releasedCount, weeks, userIds } = await releaseHeldAttempts(db, parsed.data);

    const recomputed = [];
    for (const weekStart of weeks.sort()) {
      const result = await recomputeWeeklyScores(db, userIds, weekStart);
      recomputed.push({ weekStart, ...result });
    }

    return NextResponse.json({
      data: { releasedCount, recomputed },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: { code: "NOT_FOUND", message: "No held attempts match this selection" },
        },
        { status: 404 },
      );
    }
    console.error(error);
    return errorResponse(error);
  }
}
