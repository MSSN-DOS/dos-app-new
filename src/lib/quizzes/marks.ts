/**
 * Marks helpers for the quiz builder.
 *
 * `quiz_questions.marks` is an integer column, so "Apply total marks evenly" cannot
 * hand out a fractional mark. The remainder goes to the earliest questions instead:
 * 10 marks across 3 questions -> [4, 3, 3].
 *
 * Kept out of the component so the rounding rule is unit-testable and identical
 * everywhere it is used (apply button, live total, publish validation).
 */

export type MarksDistributionError =
  "invalid-total" | "no-questions" | "total-below-count";

export type MarksDistribution =
  { ok: true; marks: number[] } | { ok: false; reason: MarksDistributionError };

/**
 * Splits `totalMarks` across `questionCount` questions as evenly as integers allow.
 * Rejects a total below the question count rather than silently assigning 0-mark
 * questions, which the publish validator would then have to special-case.
 */
export function distributeMarks(
  totalMarks: number,
  questionCount: number,
): MarksDistribution {
  if (!Number.isInteger(totalMarks) || totalMarks < 1) {
    return { ok: false, reason: "invalid-total" };
  }
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    return { ok: false, reason: "no-questions" };
  }
  if (totalMarks < questionCount) {
    return { ok: false, reason: "total-below-count" };
  }

  const base = Math.floor(totalMarks / questionCount);
  const remainder = totalMarks % questionCount;

  return {
    ok: true,
    marks: Array.from({ length: questionCount }, (_, index) =>
      index < remainder ? base + 1 : base,
    ),
  };
}

/** Total of the per-question marks shown in the builder header. */
export function sumMarks(marks: readonly number[]): number {
  return marks.reduce((total, mark) => total + mark, 0);
}
