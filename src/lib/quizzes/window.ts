/**
 * Course Quiz attempt-window resolver (DESIGN.md §4). Default window: a Course Quiz can be
 * attempted from its week_start Saturday 00:00 local time until Monday 00:00 local.
 * An Admin may override either boundary per quiz (Board decision 2026-09-28, supersedes the
 * original "Fixed" reading of decision 6) - a set opens_at/closes_at wins over the derived
 * boundary, and NULL on both sides restores the default.
 *
 * Same pattern as getActiveSemester() — one shared resolver with an injectable clock so tests
 * pass explicit timestamps instead of relying on the wall clock.
 */

export interface QuizWindowOverride {
  opensAt?: Date | null;
  closesAt?: Date | null;
}

/** Resolves the effective open/close instants, applying the admin override where present. */
export function resolveCourseQuizWindow(
  weekStart: string,
  override?: QuizWindowOverride,
): { opensAt: Date; closesAt: Date } {
  const [year, month, day] = weekStart.split("-").map(Number);
  // Africa/Lagos is WAT (UTC+1, no DST). weekStart is a WAT calendar date.
  const defaultOpensAt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 60 * 60 * 1000);
  const defaultClosesAt = new Date(Date.UTC(year, month - 1, day + 2, 0, 0, 0) - 60 * 60 * 1000);
  return {
    opensAt: override?.opensAt ?? defaultOpensAt,
    closesAt: override?.closesAt ?? defaultClosesAt,
  };
}

export function isCourseQuizWindowOpen(
  quizType: string,
  weekStart: string | null,
  now: Date = new Date(),
  override?: QuizWindowOverride,
): boolean {
  // Dev-only escape hatch for local testing outside the Sat-Sun window
  // (e.g. exercising the score-release flow on a weekday). Never active in production.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_QUIZ_WINDOW === "true"
  ) {
    return true;
  }
  if (quizType !== "course" || weekStart === null) return true;
  const { opensAt, closesAt } = resolveCourseQuizWindow(weekStart, override);
  const t = now.getTime();
  return t >= opensAt.getTime() && t < closesAt.getTime();
}
