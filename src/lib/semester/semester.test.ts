import { describe, expect, it, vi } from "vitest";
import {
  pickSessionForDate,
  resolveSemesterWithinSession,
  type SessionDates,
} from "./calendar";
import { activeCourseFilter, getActiveSemester } from "./index";

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** The session the whole system shipped with, as it was hardcoded before 2026-09-30. */
const S2025: SessionDates = {
  id: 1,
  label: "2025/26",
  harmattanStart: "2025-10-20",
  harmattanEnd: "2026-02-06",
  rainStart: "2026-02-23",
  rainEnd: "2026-07-03",
};

const S2026: SessionDates = {
  id: 2,
  label: "2026/27",
  harmattanStart: "2026-10-19",
  harmattanEnd: "2027-02-12",
  rainStart: "2027-03-01",
  rainEnd: "2027-07-16",
};

describe("resolveSemesterWithinSession", () => {
  it("resolves Harmattan during its lecture + exam span", () => {
    expect(resolveSemesterWithinSession(utcDate("2025-10-20"), S2025)).toBe("harmattan");
    expect(resolveSemesterWithinSession(utcDate("2025-12-25"), S2025)).toBe("harmattan");
    expect(resolveSemesterWithinSession(utcDate("2026-02-06"), S2025)).toBe("harmattan");
  });

  it("falls back to Harmattan in the gap between the two semesters", () => {
    expect(resolveSemesterWithinSession(utcDate("2026-02-07"), S2025)).toBe("harmattan");
    expect(resolveSemesterWithinSession(utcDate("2026-02-22"), S2025)).toBe("harmattan");
  });

  it("resolves Rain during its lecture + exam span", () => {
    expect(resolveSemesterWithinSession(utcDate("2026-02-23"), S2025)).toBe("rain");
    expect(resolveSemesterWithinSession(utcDate("2026-05-01"), S2025)).toBe("rain");
    expect(resolveSemesterWithinSession(utcDate("2026-07-03"), S2025)).toBe("rain");
  });

  it("resolves Rain in the long gap after the session has ended", () => {
    expect(resolveSemesterWithinSession(utcDate("2026-07-04"), S2025)).toBe("rain");
    expect(resolveSemesterWithinSession(utcDate("2026-09-30"), S2025)).toBe("rain");
  });

  it("is scoped to the session given, not to any hardcoded year", () => {
    // The same calendar date lands on a different semester depending on which session it is
    // read against — which is exactly what a per-session table buys.
    expect(resolveSemesterWithinSession(utcDate("2026-09-30"), S2025)).toBe("rain");
    expect(resolveSemesterWithinSession(utcDate("2026-10-19"), S2026)).toBe("harmattan");
  });
});

describe("pickSessionForDate", () => {
  it("returns null when no calendar has been entered at all", () => {
    expect(pickSessionForDate([], utcDate("2026-09-30"))).toBeNull();
  });

  it("returns null when no session has started yet", () => {
    // Before the first session ever recorded there is nothing to fall back to — an honest
    // 'no session' state, not a guess at Harmattan.
    expect(pickSessionForDate([S2026], utcDate("2025-08-01"))).toBeNull();
    expect(pickSessionForDate([S2026], utcDate("2026-10-18"))).toBeNull();
  });

  it("picks the session containing today", () => {
    expect(pickSessionForDate([S2025, S2026], utcDate("2025-12-25"))).toEqual({
      session: S2025,
      semester: "harmattan",
    });
    expect(pickSessionForDate([S2025, S2026], utcDate("2026-05-01"))).toEqual({
      session: S2025,
      semester: "rain",
    });
  });

  it("falls back to the most recent started session in the long gap between sessions", () => {
    // 2026-07-04 → 2026-10-19 is a gap where no session is running. Students should see the
    // Rain material they just sat, not an empty portal.
    expect(pickSessionForDate([S2025, S2026], utcDate("2026-07-04"))).toEqual({
      session: S2025,
      semester: "rain",
    });
    expect(pickSessionForDate([S2025, S2026], utcDate("2026-09-30"))).toEqual({
      session: S2025,
      semester: "rain",
    });
  });

  it("moves to the next session on the day it starts", () => {
    expect(pickSessionForDate([S2025, S2026], utcDate("2026-10-19"))).toEqual({
      session: S2026,
      semester: "harmattan",
    });
  });

  it("prefers the session containing today over a later one that has also started", () => {
    // Overlapping sessions are prevented by the DB CHECK on the two spans, but the resolver
    // must still not blow up if one is ever entered by hand.
    const overlapping: SessionDates = { ...S2026, id: 3, label: "2027/28", harmattanStart: "2026-01-05" };
    expect(pickSessionForDate([S2025, overlapping], utcDate("2026-05-01"))).toEqual({
      session: S2025,
      semester: "rain",
    });
  });

  it("does not depend on the order sessions are supplied in", () => {
    expect(pickSessionForDate([S2026, S2025], utcDate("2026-09-30"))).toEqual({
      session: S2025,
      semester: "rain",
    });
  });
});

/**
 * Minimal chainable stub for the two queries `getActiveSemester` runs: all sessions, and the
 * single settings row. The resolver fires both concurrently, so the stub hands back a fresh
 * thenable chain per call rather than one shared object.
 */
function dbWith(sessions: SessionDates[], settings: unknown[] | undefined) {
  let call = 0;
  const db = {
    select: vi.fn(() => {
      const isSessions = call++ === 0;
      const chain: Record<string, unknown> = {
        from: () => chain,
        orderBy: () => chain,
        limit: async () => (isSessions ? sessions : (settings ?? [])),
        then: (resolve: (v: unknown) => unknown) => resolve(isSessions ? sessions : (settings ?? [])),
      };
      return chain;
    }),
  };
  return db as unknown as Parameters<typeof getActiveSemester>[0];
}

describe("getActiveSemester", () => {
  it("returns the manual override pair when mode is manual", async () => {
    const db = dbWith([S2025, S2026], [
      { mode: "manual", manualOverride: "harmattan", manualOverrideSessionId: 2 },
    ]);
    await expect(getActiveSemester(db)).resolves.toEqual({
      ok: true,
      semester: "harmattan",
      sessionId: 2,
      sessionLabel: "2026/27",
      source: "manual",
    });
  });

  it("ignores a stale override when mode is auto", async () => {
    // Auto mode must clear both halves of the pair; if an old row somehow kept them, the
    // resolver still resolves from the calendar.
    const db = dbWith([S2025, S2026], [
      { mode: "auto", manualOverride: "rain", manualOverrideSessionId: 2 },
    ]);
    const result = await getActiveSemester(db);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("auto");
  });

  it("falls back to the calendar when no settings row exists", async () => {
    const db = dbWith([S2025, S2026], []);
    const result = await getActiveSemester(db);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("auto");
  });

  it("reports no-session rather than guessing when the table is empty", async () => {
    const db = dbWith([], []);
    await expect(getActiveSemester(db)).resolves.toEqual({
      ok: false,
      reason: "no-session",
      source: "auto",
    });
  });

  it("does not treat a half-set manual row as an override", async () => {
    // The DB CHECK makes this unreachable, but the resolver must not blow up if the row ever
    // arrives that way from a hand-edited database.
    const db = dbWith([S2025], [{ mode: "manual", manualOverride: "rain", manualOverrideSessionId: null }]);
    const result = await getActiveSemester(db);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("auto");
  });
});

describe("activeCourseFilter", () => {
  it("matches on semester *and* session, not semester alone", () => {
    // Two offerings of the same course differ only by session id. A semester-only filter would
    // show a 2025/26 student the 2026/27 quizzes, or vice versa.
    const filter = activeCourseFilter({
      ok: true,
      semester: "rain",
      sessionId: 1,
      sessionLabel: "2025/26",
      source: "auto",
    });
    expect(filter).toBeDefined();
  });

  it("matches nothing when there is no active session", () => {
    // Drizzle's and()/or() drop undefined arguments, so returning undefined here is what makes
    // every caller fall through to an empty result rather than an unfiltered one.
    expect(
      activeCourseFilter({ ok: false, reason: "no-session", source: "auto" }),
    ).toBeUndefined();
  });
});
