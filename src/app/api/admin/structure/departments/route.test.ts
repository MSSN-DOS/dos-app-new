import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/structure/departments", () => {
  it("returns 200 with departments grouped with their level ids", async () => {
    stubSelect(db, [
      [
        { id: 1, name: "Computer Science", facultyId: 2 },
        { id: 2, name: "Mathematics", facultyId: 2 },
      ],
      [
        { departmentId: 1, levelId: 10 },
        { departmentId: 1, levelId: 20 },
        { departmentId: 2, levelId: 10 },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, name: "Computer Science", facultyId: 2, levelIds: [10, 20] },
        { id: 2, name: "Mathematics", facultyId: 2, levelIds: [10] },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices departments after grouping and returns pagination metadata", async () => {
    stubSelect(db, [
      [
        { id: 1, name: "Computer Science", facultyId: 2 },
        { id: 2, name: "Mathematics", facultyId: 2 },
        { id: 3, name: "Physics", facultyId: 2 },
      ],
      [{ departmentId: 2, levelId: 10 }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, name: "Mathematics", facultyId: 2, levelIds: [10] }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
  });

  it("filters by faculty before pagination", async () => {
    stubSelect(db, [
      [
        { id: 1, name: "Computer Science", facultyId: 2 },
        { id: 2, name: "Physics", facultyId: 1 },
        { id: 3, name: "Mathematics", facultyId: 2 },
      ],
      [],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?facultyId=2&page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 3, name: "Mathematics", facultyId: 2, levelIds: [] }],
      meta: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    });
  });

  it("returns an empty list with no level links when there are no departments", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [],
      meta: { page: 1, pageSize: 0, total: 0, totalPages: 1 },
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

describe("POST /api/admin/structure/departments", () => {
  it("creates a department with its level links and returns 201", async () => {
    stubSelect(db, [[]]); // no duplicate
    const insertedLinks: Array<{ departmentId: number; levelId: number }> = [];
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () => {
          if (typeof v === "object" && v !== null && "name" in v) {
            return [{ id: 5, name: "Computer Science", facultyId: 2 }];
          }
          insertedLinks.push(...(v as typeof insertedLinks));
          return [];
        },
      }),
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        name: "Computer Science",
        facultyId: 2,
        levelIds: [10, 20],
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: 5,
      name: "Computer Science",
      facultyId: 2,
      levelIds: [10, 20],
    });
    expect(insertedLinks).toEqual([
      { departmentId: 5, levelId: 10 },
      { departmentId: 5, levelId: 20 },
    ]);
  });

  it("deduplicates the levelIds before inserting links", async () => {
    stubSelect(db, [[]]);
    const insertedLinks: number[] = [];
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () => {
          if (typeof v === "object" && v !== null && "name" in v) {
            return [{ id: 5, name: "Physics", facultyId: 1 }];
          }
          insertedLinks.push(
            ...(v as Array<{ levelId: number }>).map((l) => l.levelId),
          );
          return [];
        },
      }),
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        name: "Physics",
        facultyId: 1,
        levelIds: [10, 10, 20],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertedLinks).toEqual([10, 20]);
  });

  it("returns 409 when the department already exists in that faculty", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        name: "Computer Science",
        facultyId: 2,
        levelIds: [10],
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/already exists/i);
  });

  it.each([
    ["missing name", { facultyId: 2, levelIds: [10] }],
    ["empty name", { name: "", facultyId: 2, levelIds: [10] }],
    ["whitespace-only name", { name: "   ", facultyId: 2, levelIds: [10] }],
    ["missing facultyId", { name: "Physics", levelIds: [10] }],
    ["zero facultyId", { name: "Physics", facultyId: 0, levelIds: [10] }],
    ["missing levelIds", { name: "Physics", facultyId: 2 }],
    ["empty levelIds", { name: "Physics", facultyId: 2, levelIds: [] }],
    ["non-numeric levelId", { name: "Physics", facultyId: 2, levelIds: ["x"] }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });
});
