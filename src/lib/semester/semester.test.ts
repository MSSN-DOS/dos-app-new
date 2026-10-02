import { describe, expect, it, vi } from "vitest";
import { and, eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courses } from "@/lib/db/schema/courses";
import {
  pickSessionForDate,
  resolveSemesterWithinSession,
  type SessionDates,
} from "./calendar";
import { newestSessionEndInPast } from "./calendar";
import { activeCourseFilter, getActiveSemester } from "./index";

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * A real instant in time, not a calendar date.
 *
 * `utcDate()` deliberately pins everything to `T00:00:00Z`, which means the WAT offset
 * (`watDay`, +1h) can never change the day — so a whole suite built on `utcDate` passes whether
 * or not the offset exists. `atUtc` is how a test gets a time of day that makes the offset
 * observable: 23:00 UTC is already the next calendar day in Lagos (UTC+1).
 */
function atUtc(iso: string): Date {
  return new Date(iso);
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

  it("resolves the WAT calendar day, not the UTC one", () => {
    // 23:00 UTC on the day before Rain starts is already 00:00 in Lagos — Rain's first day. A
    // UTC-based comparison would still call this Harmattan and hide Rain for its first hour.
    // This is the only boundary `resolveSemesterWithinSession` can observe the offset at,
    // because `rainStart` is the sole comparison it makes.
    expect(resolveSemesterWithinSession(atUtc("2026-02-22T23:00:00Z"), S2025)).toBe("rain");

    // One minute earlier it is still 23:59 the previous evening in Lagos, so Harmattan holds.
    expect(resolveSemesterWithinSession(atUtc("2026-02-22T22:59:00Z"), S2025)).toBe("harmattan");
  });

  it("rolls the WAT day over at 23:00 UTC, including the year", () => {
    // A session whose Rain starts exactly on New Year's Day, so the rollover has to carry the
    // year and not just the month.
    const newYearRain: SessionDates = {
      id: 9,
      label: "2099/00",
      harmattanStart: "2099-01-01",
      harmattanEnd: "2099-06-30",
      rainStart: "2100-01-01",
      rainEnd: "2100-07-31",
    };

    // 2099-12-31T23:00Z is 2100-01-01 00:00 in Lagos: Rain.
    expect(resolveSemesterWithinSession(atUtc("2099-12-31T23:00:00Z"), newYearRain)).toBe("rain");

    // 22:59Z has not rolled yet, so Harmattan still holds.
    expect(resolveSemesterWithinSession(atUtc("2099-12-31T22:59:00Z"), newYearRain)).toBe(
      "harmattan",
    );
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

  it("switches sessions on the WAT day, not the UTC one", () => {
    // Harmattan 2026/27 opens 2026-10-19. At 23:00 UTC on the 18th it is already the 19th in
    // Lagos, so the new session is live. A UTC-day comparison would keep serving 2025/26 for
    // that final hour — and with no other session started, would report "no session at all".
    expect(pickSessionForDate([S2025, S2026], atUtc("2026-10-18T23:00:00Z"))).toEqual({
      session: S2026,
      semester: "harmattan",
    });

    // One minute earlier the 18th is still the 18th in Lagos, so 2025/26 is still current.
    expect(pickSessionForDate([S2025, S2026], atUtc("2026-10-18T22:59:00Z"))).toEqual({
      session: S2025,
      semester: "rain",
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
  /**
   * Render a SQL fragment to its Postgres text, so assertions are on behaviour not existence.
   *
   * `and()`/`or()` are typed `SQL | undefined`, so this accepts `undefined` and renders it as a
   * visible marker instead of throwing. That way a test cannot accidentally pass by rendering
   * nothing — `expect(render(x)).toContain("false")` fails loudly on `"<undefined>"`.
   */
  const render = (fragment: SQL | undefined): string =>
    fragment === undefined ? "<undefined>" : new PgDialect().sqlToQuery(fragment).sql;

  it("matches on semester *and* session, not semester alone", () => {
    // Two offerings of the same course differ only by session id. A semester-only filter would
    // show a 2025/26 student the 2026/27 quizzes, or vice versa.
    const sql = render(
      activeCourseFilter({
        ok: true,
        semester: "rain",
        sessionId: 1,
        sessionLabel: "2025/26",
        source: "auto",
      }),
    );

    // Both column predicates must be present. Asserting on the rendered SQL rather than on
    // `toBeDefined()` is the point: deleting either predicate used to leave CI green.
    expect(sql).toMatch(/"semester" = \$/);
    expect(sql).toMatch(/"session_id" = \$/);
    // The session id is the easy one to drop, so pin the value too.
    const params = new PgDialect().sqlToQuery(
      activeCourseFilter({ ok: true, semester: "rain", sessionId: 7, sessionLabel: "2025/26", source: "auto" }),
    ).params;
    expect(params).toEqual(["rain", 7]);
  });

  it("fails CLOSED when there is no active session, keeping the predicate in the query", () => {
    // The load-bearing case. Drizzle's and()/or() *drop* `undefined` arguments
    // (drizzle-orm/sql/expressions/conditions.js), so returning undefined here would not mean
    // "match nothing" — it would remove the session filter from the query entirely and return
    // every course at the caller's other constraints, across all sessions and both semesters.
    const filter = activeCourseFilter({ ok: false, reason: "no-session", source: "auto" });

    expect(filter).not.toBeUndefined();
    expect(render(filter)).toBe("false");
  });

  it("stays closed once combined with a caller's other conditions", () => {
    // `and()` keeping `false` is what makes the guarantee hold at the call sites, where the
    // fragment is never used alone.
    const combined = and(
      eq(courses.levelId, 3),
      activeCourseFilter({ ok: false, reason: "no-session", source: "auto" }),
      eq(courses.id, 9),
    );

    expect(render(combined)).toContain("false");
  });
});

describe("newestSessionEndInPast", () => {
  it("reports the newest expired session so the Admin can add real dates", () => {
    // S2025's Rain semester ended 2026-07-03. A calendar with nothing after it is stale, and the
    // gap-fallback in pickSessionForDate will keep resolving to it forever without complaint.
    expect(newestSessionEndInPast([S2025], atUtc("2026-08-01T12:00Z"))).toBe("2026-07-03");
  });

  it("stays quiet while the newest session still has dates ahead of it", () => {
    expect(newestSessionEndInPast([S2025, S2026], atUtc("2026-01-15T12:00Z"))).toBeNull();
  });

  it("judges by the newest session, not merely the presence of a live one", () => {
    // The comparator has to reduce to max(rainEnd). Checking "any session is current" would pass
    // this with S2025 present and skip the banner on a calendar that genuinely needs it.
    expect(newestSessionEndInPast([S2025, S2026], atUtc("2027-09-01T12:00Z"))).toBe(S2026.rainEnd);
  });

  it("compares in WAT, so a session's final hour is already tomorrow in Lagos", () => {
    // 2026-07-03T23:30Z is 2026-07-04T00:30 in Lagos. A UTC comparison sees 2026-07-03 and calls
    // the session current; WAT sees the 4th and calls it over. That single instant is the only
    // window where the two disagree — before 23:00Z both say "current", after 00:00Z both say
    // "over" — so it is the only one that can prove which comparison actually ran.
    expect(newestSessionEndInPast([S2025], atUtc("2026-07-03T23:30Z"))).toBe("2026-07-03");
    expect(newestSessionEndInPast([S2025], atUtc("2026-07-03T22:59Z"))).toBeNull();
    expect(newestSessionEndInPast([S2025], atUtc("2026-07-04T00:30Z"))).toBe("2026-07-03");
  });

  it("says nothing when the calendar is empty", () => {
    // An empty calendar is already a visible state in the UI. A banner on top of it would be
    // noise, and "expired" is not the right word for "never entered".
    expect(newestSessionEndInPast([], atUtc("2026-08-01T12:00Z"))).toBeNull();
  });
});
