import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { Db } from "@/lib/db";
import {
  bestScores,
  cgpaRecords,
  postUtmeScores,
  quizAttempts,
  quizzes,
} from "@/lib/db/schema";
import { computeCgpa } from "./cgpa";
import { computePostUtme } from "./post-utme";

export interface RecomputeResult {
  /** Distinct users whose cgpa_records row was written for this week. */
  cgpaUsers: number;
  /** Distinct users whose post_utme_scores row was written for this week. */
  postUtmeUsers: number;
}

/**
 * Recompute weekly CGPA and Post-UTME for the given users for one week_start,
 * after a score release (DESIGN.md §5). Runs synchronously inside the release
 * request so the API response can confirm both the release and the recompute.
 *
 * A student's best_score counts toward their CGPA only once they have at least
 * one released attempt for that quiz; likewise for Post-UTME on JAMB quizzes.
 * Visibility scoping is not re-checked here: best_scores rows only exist for
 * quizzes the user could already access when they attempted (enforced at
 * attempt time), so every eligible row is inherently in-scope for its owner.
 */
export async function recomputeWeeklyScores(
  db: Db,
  userIds: number[],
  weekStart: string,
): Promise<RecomputeResult> {
  if (userIds.length === 0) {
    return { cgpaUsers: 0, postUtmeUsers: 0 };
  }

  // Set of "<userId>:<quizId>" pairs where that user has a released attempt.
  const releasedRows = await db
    .select({ userId: quizAttempts.userId, quizId: quizAttempts.quizId })
    .from(quizAttempts)
    .where(and(isNotNull(quizAttempts.releasedAt), inArray(quizAttempts.userId, userIds)))
    .orderBy(asc(quizAttempts.quizId));
  const releasedKeys = new Set(releasedRows.map((row) => `${row.userId}:${row.quizId}`));

  // All best scores in the target week, with the quiz track each belongs to.
  const bestRows = await db
    .select({
      userId: bestScores.userId,
      quizId: bestScores.quizId,
      bestScore: bestScores.bestScore,
      courseId: quizzes.courseId,
      jambSubjectId: quizzes.jambSubjectId,
    })
    .from(bestScores)
    .innerJoin(quizzes, eq(bestScores.quizId, quizzes.id))
    .where(and(inArray(bestScores.userId, userIds), eq(quizzes.weekStart, weekStart)))
    .orderBy(asc(bestScores.quizId));

  const cgpaRows = bestRows
    .filter((row) => row.courseId !== null && releasedKeys.has(`${row.userId}:${row.quizId}`))
    .map((row) => ({ userId: row.userId, bestScore: row.bestScore }));
  const postUtmeRows = bestRows
    .filter((row) => row.jambSubjectId !== null && releasedKeys.has(`${row.userId}:${row.quizId}`))
    .map((row) => ({ userId: row.userId, bestScore: row.bestScore }));

  const cgpaValues = computeCgpa(cgpaRows);
  const postUtmeValues = computePostUtme(postUtmeRows);

  if (cgpaValues.size > 0) {
    await db
      .insert(cgpaRecords)
      .values(
        [...cgpaValues].map(([userId, value]) => ({
          userId,
          weekStart,
          cgpaValue: value.toFixed(2),
        })),
      )
      .onConflictDoUpdate({
        target: [cgpaRecords.userId, cgpaRecords.weekStart],
        set: { cgpaValue: sql`excluded.cgpa_value` },
      });
  }

  if (postUtmeValues.size > 0) {
    await db
      .insert(postUtmeScores)
      .values(
        [...postUtmeValues].map(([userId, result]) => ({
          userId,
          weekStart,
          rawScore: result.rawScore.toFixed(2),
          convertedScore50: result.convertedScore50.toFixed(2),
        })),
      )
      .onConflictDoUpdate({
        target: [postUtmeScores.userId, postUtmeScores.weekStart],
        set: {
          rawScore: sql`excluded.raw_score`,
          convertedScore50: sql`excluded.converted_score_50`,
        },
      });
  }

  return { cgpaUsers: cgpaValues.size, postUtmeUsers: postUtmeValues.size };
}
