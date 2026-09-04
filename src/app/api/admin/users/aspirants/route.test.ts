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

describe("GET /api/admin/users/aspirants", () => {
  it("returns the aspirant directory with latest Post-UTME score", async () => {
    stubSelect(db, [
      [
        { id: 3, fullName: "Yusuf, F.", identifier: "12345678AB", isActive: true, aspirationDepartment: "Medicine & Surgery" },
      ],
      [{ userId: 3, weekStart: "2026-08-24", convertedScore50: "76.00" }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 3, fullName: "Yusuf, F.", identifier: "12345678AB", isActive: true, aspirationDepartment: "Medicine & Surgery", latestPostUtme: "76.00" },
      ],
      meta: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns null latestPostUtme when the aspirant has no scores yet", async () => {
    stubSelect(db, [[{ id: 4, fullName: "New, B.", identifier: "87654321CD", isActive: true, aspirationDepartment: null }], []]);
    const res = await GET(jsonRequest("http://localhost/x?search=new", "GET"));
    const body = await res.json();
    expect(body.data[0].latestPostUtme).toBeNull();
  });

  it("skips the score lookup when no aspirants match", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid pagination with 422", async () => {
    const res = await GET(jsonRequest("http://localhost/x?pageSize=999", "GET"));
    expect(res.status).toBe(422);
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
