/**
 * CGPA computation (DESIGN.md §5): the weekly CGPA for a student is the unweighted
 * mean of their best_score across RELEASED Course Quiz best_scores whose quiz
 * week_start matches the week being computed. Pure function — the caller fetches
 * the eligible best_scores rows and maps them into CgpaInputRow shapes.
 */

export interface CgpaInputRow {
  userId: number;
  bestScore: number | string;
}

/** Mean of a list of numeric scores, converted to 5.00 CGPA scale and rounded to 2 decimals. */
function meanToCgpa(scores: number[]): number {
  const total = scores.reduce((sum, value) => sum + value, 0);
  const percentageMean = total / scores.length;
  const cgpa = percentageMean / 20;
  const clamped = Math.max(0, Math.min(5, cgpa));
  return Math.round(clamped * 100) / 100;
}

/**
 * Compute one CGPA value per user from their eligible best-score rows.
 * Rows for other users are ignored; users with no rows simply get no entry.
 * CGPA is on the Nigerian 5.00 scale: percentage mean (0-100) / 20.
 */
export function computeCgpa(rows: CgpaInputRow[]): Map<number, number> {
  const byUser = new Map<number, number[]>();
  for (const row of rows) {
    const scores = byUser.get(row.userId) ?? [];
    scores.push(Number(row.bestScore));
    byUser.set(row.userId, scores);
  }

  const result = new Map<number, number>();
  for (const [userId, scores] of byUser) {
    result.set(userId, meanToCgpa(scores));
  }
  return result;
}
