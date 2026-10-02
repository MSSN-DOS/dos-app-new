import { afterEach, describe, expect, it, vi } from "vitest";

import { isCourseQuizWindowOpen, resolveCourseQuizWindow } from "./window";

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

  describe("admin availability override", () => {
    it("opens a quiz early when opensAt is set before the default Saturday", () => {
      // Friday 09:00 — closed by default, open because the admin released it early.
      const friday = at(2026, 8, 21, 9);
      expect(isCourseQuizWindowOpen("course", WEEK, friday)).toBe(false);
      expect(
        isCourseQuizWindowOpen("course", WEEK, friday, { opensAt: at(2026, 8, 21, 8) }),
      ).toBe(true);
    });

    it("keeps the default close when only opensAt is overridden", () => {
      const early = at(2026, 8, 21, 9);
      const monday = at(2026, 8, 24, 0, 0, 1);
      const override = { opensAt: at(2026, 8, 21, 8) };
      expect(isCourseQuizWindowOpen("course", WEEK, early, override)).toBe(true);
      // Still closes at the default Monday 00:00 WAT.
      expect(isCourseQuizWindowOpen("course", WEEK, monday, override)).toBe(false);
    });

    it("closes a quiz early when closesAt is set", () => {
      const saturdayNoon = at(2026, 8, 22, 12);
      const override = { closesAt: at(2026, 8, 22, 10) };
      expect(isCourseQuizWindowOpen("course", WEEK, saturdayNoon)).toBe(true);
      expect(isCourseQuizWindowOpen("course", WEEK, saturdayNoon, override)).toBe(false);
    });

    it("extends the window past Monday when closesAt is later", () => {
      const tuesday = at(2026, 8, 25, 12);
      expect(isCourseQuizWindowOpen("course", WEEK, tuesday)).toBe(false);
      expect(
        isCourseQuizWindowOpen("course", WEEK, tuesday, { closesAt: at(2026, 8, 26, 0) }),
      ).toBe(true);
    });

    it("restores the default window when both overrides are null", () => {
      const tuesday = at(2026, 8, 25, 12);
      expect(
        isCourseQuizWindowOpen("course", WEEK, tuesday, { opensAt: null, closesAt: null }),
      ).toBe(false);
    });

    it("never opens a degenerate window where close is not after open", () => {
      const saturday = at(2026, 8, 22, 12);
      const inverted = { opensAt: at(2026, 8, 23), closesAt: at(2026, 8, 22) };
      expect(isCourseQuizWindowOpen("course", WEEK, saturday, inverted)).toBe(false);
    });

    it("ignores the override entirely for topic quizzes", () => {
      const tuesday = at(2026, 8, 25, 12);
      const closed = { opensAt: at(2026, 9, 1), closesAt: at(2026, 9, 2) };
      expect(isCourseQuizWindowOpen("topic", null, tuesday, closed)).toBe(true);
    });
  });

  describe("resolveCourseQuizWindow", () => {
    it("derives Saturday 00:00 -> Monday 00:00 WAT when nothing is overridden", () => {
      const w = resolveCourseQuizWindow(WEEK);
      expect(w.opensAt.toISOString()).toBe("2026-08-21T23:00:00.000Z");
      expect(w.closesAt.toISOString()).toBe("2026-08-23T23:00:00.000Z");
    });

    it("prefers the override on each side independently", () => {
      const opensAt = at(2026, 8, 20, 8);
      const w = resolveCourseQuizWindow(WEEK, { opensAt });
      expect(w.opensAt).toEqual(opensAt);
      expect(w.closesAt.toISOString()).toBe("2026-08-23T23:00:00.000Z");
    });
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
