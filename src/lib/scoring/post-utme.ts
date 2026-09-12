/**
 * Post-UTME computation (DESIGN.md §5): the weekly Post-UTME score for an aspirant is
 * the unweighted mean of their best_score across RELEASED JAMB-subject quiz
 * best_scores whose quiz week_start matches the week being computed, plus a
 * conversion to the 50-point scale used for aggregate ranking.
 * Pure function — the caller fetches the eligible best_scores rows.
 */

export interface PostUtmeInputRow {
  userId: number;
  bestScore: number | string;
}

export interface PostUtmeResult {
  /** Unweighted mean of the aspirant's released best scores, 0–100, 2 decimals. */
  rawScore: number;
  /** Aggregate score on the 0–100 scale (identity of rawScore), 2 decimals. */
  convertedScore50: number;
}

/**
 * Convert a Post-UTME raw score onto the aggregate scale.
 *
 * Board-confirmed (2026-08-25): the Post-UTME aggregate is out of 100. Our stored
 * best_score is already a percentage (0–100), which for the 50-question quiz equals
 * correct_answers × 2 — so the conversion is the identity. Kept as a function so a
 * future scale change touches one place only.
 */
export function convertToPostUtmeScale(rawScore: number): number {
  return Math.round(rawScore * 100) / 100;
}

/**
 * Compute one Post-UTME result per user from their eligible best-score rows.
 * Rows for other users are ignored; users with no rows simply get no entry.
 */
export function computePostUtme(rows: PostUtmeInputRow[]): Map<number, PostUtmeResult> {
  const byUser = new Map<number, number[]>();
  for (const row of rows) {
    const scores = byUser.get(row.userId) ?? [];
    scores.push(Number(row.bestScore));
    byUser.set(row.userId, scores);
  }

  const result = new Map<number, PostUtmeResult>();
  for (const [userId, scores] of byUser) {
    const total = scores.reduce((sum, value) => sum + value, 0);
    const rawScore = Math.round((total / scores.length) * 100) / 100;
    result.set(userId, { rawScore, convertedScore50: convertToPostUtmeScale(rawScore) });
  }
  return result;
}
