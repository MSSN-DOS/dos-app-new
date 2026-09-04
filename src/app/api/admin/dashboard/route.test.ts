import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/dashboard", () => {
  it("returns role counts and the pending-release count for an admin", async () => {
    // Select order: held attempts, then students / aspirants / teachers counts.
    stubSelect(db, [
      [{ id: 1 }, { id: 2 }],
      [{ id: 10 }, { id: 11 }, { id: 12 }],
      [{ id: 20 }],
      [{ id: 30 }, { id: 31 }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      counts: { students: 3, aspirants: 1, teachers: 2 },
      pendingReleases: 2,
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns zeros on an empty platform", async () => {
    stubSelect(db, [[], [], [], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    await expect(res.json()).resolves.toEqual({
      counts: { students: 0, aspirants: 0, teachers: 0 },
      pendingReleases: 0,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});
