import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

/**
 * The `academic_sessions` columns the resolver reads. These are `date` columns, so the driver
 * hands them back as `YYYY-MM-DD` **strings** — the resolver compares them against `watDay()`,
 * which also returns a string, so a `Date` here silently fails every comparison and the session
 * looks like it never started.
 *
 * The window is in 2999 so a GET test's outcome depends only on the mode/override rows rather
 * than on today's date, which would make these assertions drift and start failing with time.
 */
const SESSION_DATES = {
  harmattanStart: "2999-01-01",
  harmattanEnd: "2999-06-30",
  rainStart: "2999-07-01",
  rainEnd: "2999-12-31",
};

describe("GET /api/admin/settings/semester", () => {
  it("returns the stored settings row", async () => {
    // Three selects happen, in this order: the route's own settings read, then the two that
    // `getActiveSemester` runs inside a `Promise.all` (calendar first, settings second). The stub
    // returns each array once per call, so they have to be supplied in call order.
    stubSelect(db, [
      [
        {
          mode: "manual",
          manualOverride: "rain",
          manualOverrideSessionId: 2,
          updatedAt: "2026-08-25",
        },
      ],
      [{ id: 2, label: "2026/27", ...SESSION_DATES }],
      [{ mode: "manual", manualOverride: "rain", manualOverrideSessionId: 2 }],
    ]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "manual",
        manualOverride: "rain",
        manualOverrideSessionId: 2,
        updatedAt: "2026-08-25",
        // Resolved server-side so every "what is active" badge in the admin UI has a single
        // source of truth. The label comes from the calendar, not from the override row — that is
        // why the picker's value is never trusted for display.
        active: { semester: "rain", sessionId: 2, sessionLabel: "2026/27", source: "manual" },
      },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns the auto default when no row exists yet", async () => {
    // Three selects, all empty: no settings row, no sessions, and no settings row for the resolver.
    stubSelect(db, [[], [], []]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "auto",
        manualOverride: null,
        manualOverrideSessionId: null,
        updatedAt: null,
        // No settings row means auto mode, which resolves against the calendar. With the
        // calendar stubbed empty there is nothing to resolve to, and `active` is null rather than
        // a guess — the UI must not label anything "active" when nothing resolved.
        active: null,
      },
    });
  });

  it("reports active as null rather than guessing when auto mode resolves nothing", async () => {
    // The degenerate case the R-10 fix depends on: a portal with no calendar entered must show no
    // "active" badges at all, not badges computed against a half-empty list.
    stubSelect(db, [[], [], []]);
    const res = await GET(jsonRequest("http://localhost/x"));
    await expect(res.json()).resolves.toMatchObject({ data: { active: null } });
  });

  it("resolves active from the calendar in auto mode, independent of the settings row", async () => {
    // Auto mode with a real session in range: the calendar decides, and the settings row plays no
    // part. The window is built around *today* on purpose — this is the one assertion that is
    // specifically about the current date falling inside a session's Harmattan span.
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, "0");
    const d = String(today.getUTCDate()).padStart(2, "0");
    stubSelect(db, [
      // 1. the route's own settings read (empty → auto default)
      [],
      // 2. the session calendar — spans today, so it has started and is still open
      [
        {
          id: 1,
          label: "auto-session",
          harmattanStart: "2000-01-01",
          harmattanEnd: "2999-06-30",
          rainStart: `${y + 1}-01-01`,
          rainEnd: `${y + 1}-12-31`,
        },
      ],
      // 3. the resolver's settings read
      [{ mode: "auto", manualOverride: null, manualOverrideSessionId: null }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x"));

    // Harmattan only holds while today is before rainStart; assert against the real boundary
    // rather than assuming one, so this stays true on 1 January as well as in October.
    const expectedSemester = `${y}-${m}-${d}` < `${y + 1}-01-01` ? "harmattan" : "rain";
    await expect(res.json()).resolves.toMatchObject({
      data: {
        active: {
          semester: expectedSemester,
          sessionId: 1,
          sessionLabel: "auto-session",
          source: "auto",
        },
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/settings/semester", () => {
  it("upserts mode=auto and reports the saved row", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
    stubInsert(db, [
      {
        mode: "auto",
        manualOverride: null,
        manualOverrideSessionId: null,
        updatedAt: "2026-08-25",
      },
    ]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { mode: "auto", manualOverride: null }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "auto",
        manualOverride: null,
        manualOverrideSessionId: null,
        updatedAt: "2026-08-25",
      },
    });
  });

  it("upserts mode=manual with the override pair and reports the saved row", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
    // The route first confirms the session exists, so that select has to return a row.
    stubSelect(db, [[{ id: 2 }]]);
    stubInsert(db, [
      {
        mode: "manual",
        manualOverride: "rain",
        manualOverrideSessionId: 2,
        updatedAt: "2026-08-25",
      },
    ]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "manual",
        manualOverride: "rain",
        manualOverrideSessionId: 2,
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "manual",
        manualOverride: "rain",
        manualOverrideSessionId: 2,
        updatedAt: "2026-08-25",
      },
    });
  });

  it("returns 404 when the override names a session that does not exist", async () => {
    // A semester with no session resolves to nothing, which would filter out every course in
    // the portal. Better to refuse the save than to save a total blackout.
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
    stubSelect(db, [[]]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "manual",
        manualOverride: "harmattan",
        manualOverrideSessionId: 99,
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toContain("99");
  });

  it("clears the override when switching back to auto", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
    let capturedValues: Record<string, unknown> | undefined;
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        const result = [
          {
            mode: "auto",
            manualOverride: null,
            manualOverrideSessionId: null,
            updatedAt: "2026-08-25",
          },
        ];
        const returning = async () => result;
        const promise = Promise.resolve(result) as ReturnType<typeof returning> & {
          returning: typeof returning;
        };
        promise.returning = returning;
        return { returning, onConflictDoUpdate: () => promise };
      },
    }));

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "auto",
        manualOverride: "harmattan",
        manualOverrideSessionId: 2,
      }),
    );
    expect(res.status).toBe(200);
    // The stored row must not imply the stale override is in force, and the DB CHECK requires
    // both halves to clear together.
    expect(capturedValues?.manualOverride).toBeNull();
    expect(capturedValues?.manualOverrideSessionId).toBeNull();
  });

  it("returns 422 when manual mode has no override semester", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "manual",
        manualOverrideSessionId: 2,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "manualOverride" })]),
    );
  });

  it("returns 422 when manual mode has a semester but no session", async () => {
    // The half-set override is the case the DB CHECK exists for; catching it in Zod turns a
    // constraint violation into a field-level message.
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "manual",
        manualOverride: "rain",
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "manualOverrideSessionId" }),
      ]),
    );
  });

  it("returns 422 for an unknown mode or extra fields", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { mode: "bogus" }),
    );
    expect(res.status).toBe(422);

    const res2 = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        mode: "auto",
        surprise: true,
      }),
    );
    expect(res2.status).toBe(422);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { mode: "auto" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { mode: "auto" }));
    expect(res.status).toBe(403);
  });
});
