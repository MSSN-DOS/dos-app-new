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
      [{ mode: "manual", manualOverride: "rain", updatedAt: "2026-08-25" }],
    ]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { mode: "manual", manualOverride: "rain", updatedAt: "2026-08-25" },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns the auto default when no row exists yet", async () => {
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { mode: "auto", manualOverride: null, updatedAt: null },
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
  it.each([
    ["auto", null as string | null],
    ["manual", "rain"],
  ])(
    "upserts mode=%s with override=%s and reports the saved row",
    async (mode, override) => {
      requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
      stubInsert(db, [{ mode, manualOverride: override, updatedAt: "2026-08-25" }]);

      const res = await PATCH(
        jsonRequest("http://localhost/x", "PATCH", {
          mode,
          manualOverride: override,
        }),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        data: { mode, manualOverride: override, updatedAt: "2026-08-25" },
      });
    },
  );

  it("clears the override when switching back to auto", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });
    let capturedValues: Record<string, unknown> | undefined;
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        const result = [
          { mode: "auto", manualOverride: null, updatedAt: "2026-08-25" },
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
      }),
    );
    expect(res.status).toBe(200);
    // The stored row must not imply the stale harmattan override is in force
    expect(capturedValues?.manualOverride).toBeNull();
  });

  it("returns 422 when manual mode has no override", async () => {
    requireAuth.mockResolvedValue({ userId: 3, roleId: 1 });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { mode: "manual" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
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
