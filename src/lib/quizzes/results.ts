export function quizScoreDistribution(
  scores: number[],
): { range: string; count: number }[] {
  return ["0–19", "20–39", "40–59", "60–79", "80–100"].map((range, index) => ({
    range,
    count: scores.filter(
      (score) =>
        Number.isFinite(score) &&
        score >= index * 20 &&
        (index === 4 ? score <= 100 : score < (index + 1) * 20),
    ).length,
  }));
}
export function attemptDurationSeconds(
  startedAt: Date | null | undefined,
  submittedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !submittedAt) return null;
  const duration = Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}
