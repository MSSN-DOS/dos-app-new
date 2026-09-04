import { afterEach, describe, expect, it, vi } from "vitest";

import { isCourseQuizWindowOpen } from "./window";

// WAT helpers — window uses Africa/Lagos (UTC+1). `at` creates a WAT local timestamp
// regardless of the runner's TZ (CI is UTC) by building UTC then shifting -1h.
function at(y: number, m: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s) - 60 * 60 * 1000);
}

const WEEK = "2026-08-22"; // a Saturday

describe("isCourseQuizWindowOpen", () => {
  it("is always open for topic quizzes regardless of the clock", () => {
    const tuesday = at(2026, 8, 25, 12);
    expect(isCourseQuizWindowOpen("topic", null, tuesday)).toBe(true);
    expect(isCourseQuizWindowOpen("topic", WEEK, tuesday)).toBe(true);
  });

  it("is open for a course quiz whose week_start is null (defensive)", () => {
    expect(isCourseQuizWindowOpen("course", null, at(2026, 8, 25))).toBe(true);
  });

  it("blocks a Tuesday mid-week attempt", () => {
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 25, 12, 0))).toBe(false);
  });

  it("blocks Friday 23:59:59, one second before the window", () => {
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 21, 23, 59, 59))).toBe(false);
  });

  it("opens exactly at Saturday 00:00:00 local", () => {
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 22, 0, 0, 0))).toBe(true);
  });

  it("stays open Sunday 23:59:59", () => {
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 23, 23, 59, 59))).toBe(true);
  });

  it("closes at Monday 00:00:00 and stays closed Monday 00:00:01", () => {
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 24, 0, 0, 0))).toBe(false);
    expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 24, 0, 0, 1))).toBe(false);
  });

  describe("DEV_BYPASS_QUIZ_WINDOW", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("opens the window on a Tuesday in non-production when set to true", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_BYPASS_QUIZ_WINDOW", "true");
      expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 25, 12))).toBe(true);
    });

    it("has no effect outside non-production environments", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_BYPASS_QUIZ_WINDOW", "true");
      expect(isCourseQuizWindowOpen("course", WEEK, at(2026, 8, 25, 12))).toBe(false);
    });
  });
});
