import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import { jsonRequest, makeDbMock, stubInsert, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/structure/levels", () => {
  it("returns 200 with the level list for an admin", async () => {
    stubSelect(db, [[{ id: 1, value: 100 }, { id: 2, value: 200 }]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 1, value: 100 }, { id: 2, value: 200 }],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices the requested page and returns pagination metadata", async () => {
    stubSelect(db, [[{ id: 1, value: 100 }, { id: 2, value: 200 }, { id: 3, value: 300 }]]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, value: 200 }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
  });

  it("returns 422 for invalid pagination parameters", async () => {
    const res = await GET(jsonRequest("http://localhost/x?page=0&pageSize=1", "GET"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the caller is not an admin", async () => {
    const { ForbiddenError } = await import("@/lib/auth/errors");
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/structure/levels", () => {
  it("creates a level and returns 201", async () => {
    stubSelect(db, [[]]); // no duplicate
    stubInsert(db, { id: 9, value: 300 });
    const res = await POST(jsonRequest("http://localhost/x", "POST", { value: 300 }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 9, value: 300 });
  });

  it("coerces a string value from a form-style payload", async () => {
    stubSelect(db, [[]]);
    stubInsert(db, { id: 9, value: 300 });
    const res = await POST(jsonRequest("http://localhost/x", "POST", { value: "300" }));
    expect(res.status).toBe(201);
  });

  it("returns 409 when the level already exists", async () => {
    stubSelect(db, [[{ id: 1, value: 100 }]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", { value: 100 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it.each([
    ["missing value", {}],
    ["non-numeric value", { value: "abc" }],
    ["zero value", { value: 0 }],
    ["float value", { value: 100.5 }],
    ["out-of-range value", { value: 123456 }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });
});
