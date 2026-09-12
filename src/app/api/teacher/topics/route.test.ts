import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
});

describe("GET /api/teacher/topics", () => {
  it("returns 200 with the topic list including course codes", async () => {
    stubSelect(db, [
      [
        { id: 1, title: "Trigonometry", courseId: 2, courseCode: "MAT 101" },
        { id: 2, title: "Algebra", courseId: 2, courseCode: "MAT 101" },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, title: "Trigonometry", courseId: 2, courseCode: "MAT 101" },
        { id: 2, title: "Algebra", courseId: 2, courseCode: "MAT 101" },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });

  it("slices the requested page and returns pagination metadata", async () => {
    stubSelect(db, [[
      { id: 1, title: "Algebra", courseId: 2, courseCode: "MAT 101" },
      { id: 2, title: "Geometry", courseId: 2, courseCode: "MAT 101" },
      { id: 3, title: "Trigonometry", courseId: 2, courseCode: "MAT 101" },
    ]]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, title: "Geometry", courseId: 2, courseCode: "MAT 101" }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
  });

  it("returns an empty list when no topics exist", async () => {
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

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/teacher/topics", () => {
  const validBody = { title: "Trigonometry", courseId: 2 };

  it("creates a topic owned by the caller and returns 201", async () => {
    stubSelect(db, [[]]);
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10, ...v }] };
      },
    }));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(10);
    expect(inserted.title).toBe("Trigonometry");
    expect(inserted.courseId).toBe(2);
    expect(inserted.createdBy).toBe(5);
  });

  it("trims surrounding whitespace from the title", async () => {
    stubSelect(db, [[]]);
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10 }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { title: "  Trigonometry  ", courseId: 2 }),
    );
    expect(res.status).toBe(201);
    expect(inserted.title).toBe("Trigonometry");
  });

  it("returns 409 when the topic already exists in the course", async () => {
    stubSelect(db, [[{ id: 7 }]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/already exists in this course/i);
  });

  it.each([
    ["missing title", { courseId: 2 }],
    ["empty title", { title: "", courseId: 2 }],
    ["whitespace title", { title: "   ", courseId: 2 }],
    ["title over 200 chars", { title: "T".repeat(201), courseId: 2 }],
    ["missing courseId", { title: "Trigonometry" }],
    ["zero courseId", { title: "Trigonometry", courseId: 0 }],
    ["non-numeric courseId", { title: "Trigonometry", courseId: "abc" }],
  ])("returns 422 with details for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(403);
  });
});
