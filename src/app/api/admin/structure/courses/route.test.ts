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

describe("GET /api/admin/structure/courses", () => {
  it("returns 200 with courses grouped with their interfaculty faculty ids", async () => {
    stubSelect(db, [
      [
        {
          id: 1,
          code: "GNS 101",
          title: "Use of English",
          levelId: 10,
          semester: "harmattan",
          scopeType: "general",
          departmentId: null,
          facultyId: null,
        },
        {
          id: 2,
          code: "MAT 101",
          title: "Mathematics",
          levelId: 10,
          semester: "harmattan",
          scopeType: "interfaculty",
          departmentId: null,
          facultyId: null,
        },
      ],
      [
        { courseId: 2, facultyId: 3 },
        { courseId: 2, facultyId: 4 },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 1,
          code: "GNS 101",
          title: "Use of English",
          levelId: 10,
          semester: "harmattan",
          scopeType: "general",
          departmentId: null,
          facultyId: null,
          facultyIds: [],
        },
        {
          id: 2,
          code: "MAT 101",
          title: "Mathematics",
          levelId: 10,
          semester: "harmattan",
          scopeType: "interfaculty",
          departmentId: null,
          facultyId: null,
          facultyIds: [3, 4],
        },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices courses after grouping and returns pagination metadata", async () => {
    stubSelect(db, [
      [
        { id: 1, code: "GNS 101", title: "English", levelId: 10, semester: "harmattan", scopeType: "general", departmentId: null, facultyId: null },
        { id: 2, code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "general", departmentId: null, facultyId: null },
        { id: 3, code: "PHY 101", title: "Physics", levelId: 10, semester: "harmattan", scopeType: "general", departmentId: null, facultyId: null },
      ],
      [],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "general", departmentId: null, facultyId: null, facultyIds: [] }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
  });

  it("filters by department, level, and semester before pagination", async () => {
    stubSelect(db, [
      [
        { id: 1, code: "CSC 101", title: "Intro", levelId: 10, semester: "harmattan", scopeType: "department", departmentId: 3, facultyId: null },
        { id: 2, code: "CSC 102", title: "Logic", levelId: 10, semester: "harmattan", scopeType: "department", departmentId: 3, facultyId: null },
        { id: 3, code: "MAT 101", title: "Math", levelId: 20, semester: "rain", scopeType: "department", departmentId: 4, facultyId: null },
      ],
      [],
    ]);
    const res = await GET(
      jsonRequest("http://localhost/x?departmentId=3&levelId=10&semester=harmattan&page=2&pageSize=1", "GET"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, code: "CSC 102", title: "Logic", levelId: 10, semester: "harmattan", scopeType: "department", departmentId: 3, facultyId: null, facultyIds: [] }],
      meta: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    });
  });

  it("returns an empty list when there are no courses", async () => {
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

describe("POST /api/admin/structure/courses", () => {
  it("creates a department-scoped course and returns 201", async () => {
    stubSelect(db, [[]]); // no duplicate
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () =>
          typeof v === "object" && v !== null && "code" in v
            ? [
                {
                  id: 5,
                  code: "MAT 101",
                  title: "Mathematics",
                  levelId: 10,
                  semester: "harmattan",
                  scopeType: "department",
                  departmentId: 3,
                  facultyId: null,
                },
              ]
            : [],
      }),
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        code: "MAT 101",
        title: "Mathematics",
        levelId: 10,
        semester: "harmattan",
        scopeType: "department",
        departmentId: 3,
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: 5,
      code: "MAT 101",
      title: "Mathematics",
      levelId: 10,
      semester: "harmattan",
      scopeType: "department",
      departmentId: 3,
      facultyId: null,
      facultyIds: [],
    });
  });

  it("creates an interfaculty course with its faculty links and dedupes them", async () => {
    stubSelect(db, [[]]);
    const insertedLinks: Array<{ courseId: number; facultyId: number }> = [];
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () => {
          if (typeof v === "object" && v !== null && "code" in v) {
            return [
              {
                id: 6,
                code: "ENT 201",
                title: "Entrepreneurship",
                levelId: 20,
                semester: "rain",
                scopeType: "interfaculty",
                departmentId: null,
                facultyId: null,
              },
            ];
          }
          insertedLinks.push(...(v as typeof insertedLinks));
          return [];
        },
      }),
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        code: "ENT 201",
        title: "Entrepreneurship",
        levelId: 20,
        semester: "rain",
        scopeType: "interfaculty",
        facultyIds: [3, 4, 3],
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: 6, facultyIds: [3, 4] });
    expect(insertedLinks).toEqual([
      { courseId: 6, facultyId: 3 },
      { courseId: 6, facultyId: 4 },
    ]);
  });

  it("returns 409 when the course already exists at that level for that semester", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        code: "MAT 101",
        title: "Mathematics",
        levelId: 10,
        semester: "harmattan",
        scopeType: "general",
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/already exists/i);
  });

  it.each([
    ["missing code", { title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "general" }],
    ["empty code", { code: "", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "general" }],
    ["missing title", { code: "MAT 101", levelId: 10, semester: "harmattan", scopeType: "general" }],
    ["zero levelId", { code: "MAT 101", title: "Mathematics", levelId: 0, semester: "harmattan", scopeType: "general" }],
    ["non-numeric levelId", { code: "MAT 101", title: "Mathematics", levelId: "x", semester: "harmattan", scopeType: "general" }],
    ["invalid semester", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "summer", scopeType: "general" }],
    ["invalid scopeType", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "world" }],
    ["department scope without departmentId", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "department" }],
    ["department scope with a faculty too", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "department", departmentId: 3, facultyId: 2 }],
    ["faculty scope without facultyId", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "faculty" }],
    ["general scope with a department", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "general", departmentId: 3 }],
    ["interfaculty with fewer than two faculties", { code: "MAT 101", title: "Mathematics", levelId: 10, semester: "harmattan", scopeType: "interfaculty", facultyIds: [3] }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        code: "MAT 101",
        title: "Mathematics",
        levelId: 10,
        semester: "harmattan",
        scopeType: "general",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        code: "MAT 101",
        title: "Mathematics",
        levelId: 10,
        semester: "harmattan",
        scopeType: "general",
      }),
    );
    expect(res.status).toBe(403);
  });
});
