/**
 * Single Course Quiz attempt-window resolver (DESIGN.md §4): a Course Quiz can be
 * attempted from its week_start Saturday 00:00 local time until Monday 00:00 local.
 * Same pattern as getActiveSemester() — one shared resolver with an injectable
 * clock so tests pass explicit timestamps instead of relying on the wall clock.
 */
export function isCourseQuizWindowOpen(
  quizType: string,
  weekStart: string | null,
  now: Date = new Date(),
): boolean {
  // Dev-only escape hatch for local testing outside the Sat–Sun window
  // (e.g. exercising the score-release flow on a weekday). Never active in production.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_QUIZ_WINDOW === "true"
  ) {
    return true;
  }
  if (quizType !== "course" || weekStart === null) return true;
  const [year, month, day] = weekStart.split("-").map(Number);
  // Africa/Lagos is WAT (UTC+1, no DST). weekStart is a WAT calendar date.
  const opensAtUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - 60 * 60 * 1000;
  const closesAtUtc = Date.UTC(year, month - 1, day + 2, 0, 0, 0) - 60 * 60 * 1000;
  const t = now.getTime();
  return t >= opensAtUtc && t < closesAtUtc;
}
