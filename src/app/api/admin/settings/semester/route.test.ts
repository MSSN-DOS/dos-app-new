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

describe("GET /api/admin/settings/semester", () => {
  it("returns the stored settings row", async () => {
    stubSelect(db, [
      [
        {
          mode: "manual",
          manualOverride: "rain",
          manualOverrideSessionId: 2,
          updatedAt: "2026-08-25",
        },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "manual",
        manualOverride: "rain",
        manualOverrideSessionId: 2,
        updatedAt: "2026-08-25",
      },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns the auto default when no row exists yet", async () => {
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        mode: "auto",
        manualOverride: null,
        manualOverrideSessionId: null,
        updatedAt: null,
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
      expect.arrayContaining([expect.objectContaining({ field: "manualOverrideSessionId" })]),
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
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { mode: "auto" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { mode: "auto" }),
    );
    expect(res.status).toBe(403);
  });
});
