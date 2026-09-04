import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

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

describe("GET /api/admin/structure/faculties", () => {
  it("returns 200 with the faculty list for an admin", async () => {
    stubSelect(db, [[{ id: 1, name: "Engineering" }, { id: 2, name: "Science" }]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 1, name: "Engineering" }, { id: 2, name: "Science" }],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices the requested page and returns pagination metadata", async () => {
    stubSelect(db, [[{ id: 1, name: "Engineering" }, { id: 2, name: "Science" }, { id: 3, name: "Arts" }]]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, name: "Science" }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
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

describe("POST /api/admin/structure/faculties", () => {
  it("creates a faculty and returns 201", async () => {
    stubSelect(db, [[]]); // no duplicate
    stubInsert(db, { id: 5, name: "Engineering" });
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { name: "Engineering" }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 5, name: "Engineering" });
  });

  it("trims surrounding whitespace from the name before insert", async () => {
    stubSelect(db, [[]]);
    const inserted: { name?: string } = {};
    db.insert.mockImplementation(() => ({
      values: (v: { name: string }) => {
        inserted.name = v.name;
        return { returning: async () => [{ id: 5, name: v.name }] };
      },
    }));
    const res = await POST(jsonRequest("http://localhost/x", "POST", { name: "  Science  " }));
    expect(res.status).toBe(201);
    expect(inserted.name).toBe("Science");
  });

  it("returns 409 when the faculty already exists", async () => {
    stubSelect(db, [[{ id: 1, name: "Science" }]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", { name: "Science" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it.each([
    ["empty name", { name: "" }],
    ["whitespace-only name", { name: "   " }],
    ["missing name", {}],
    ["name over 150 chars", { name: "x".repeat(151) }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
  });
});
