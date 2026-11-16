export function quizAttemptLimit(quiz: {
  allowMultipleAttempts: boolean;
  maxAttempts?: number | null;
}): number | null {
  return quiz.allowMultipleAttempts ? (quiz.maxAttempts ?? null) : 1;
}

export function hasAttemptRemaining(
  quiz: { allowMultipleAttempts: boolean; maxAttempts?: number | null },
  completed: number,
): boolean {
  const limit = quizAttemptLimit(quiz);
  return limit === null || completed < limit;
}
