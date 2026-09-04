import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const hashPassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/password", () => ({ hashPassword }));

import { GET, POST } from "./route";
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
  hashPassword.mockResolvedValue("$2a$12$hashed");
});

describe("GET /api/admin/teachers", () => {
  it("returns 200 with the teacher list and published-quiz counts for an admin", async () => {
    stubSelect(db, [
      [
        { id: 1, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true },
        { id: 2, fullName: "Adebayo, K.", identifier: "STF-002", isActive: false },
      ],
      [{ createdBy: 1 }, { createdBy: 1 }, { createdBy: 2 }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true, publishedQuizzes: 2 },
        { id: 2, fullName: "Adebayo, K.", identifier: "STF-002", isActive: false, publishedQuizzes: 1 },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices teachers after counting published quizzes and returns pagination metadata", async () => {
    stubSelect(db, [
      [
        { id: 1, fullName: "A. First", identifier: "STF-001", isActive: true },
        { id: 2, fullName: "B. Second", identifier: "STF-002", isActive: true },
        { id: 3, fullName: "C. Third", identifier: "STF-003", isActive: true },
      ],
      [{ createdBy: 2 }, { createdBy: 2 }, { createdBy: 3 }],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: 2, fullName: "B. Second", identifier: "STF-002", isActive: true, publishedQuizzes: 2 }]);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("returns zero counts when nothing is published", async () => {
    stubSelect(db, [[{ id: 1, fullName: "Solo", identifier: "STF-001", isActive: true }], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].publishedQuizzes).toBe(0);
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

describe("POST /api/admin/teachers", () => {
  const validBody = { fullName: "Ibrahim, S.", staffId: "STF-014", password: "initial-pass-123" };

  it("creates a teacher account and returns 201 without leaking the password hash", async () => {
    stubSelect(db, [[{ id: 3, name: "teacher" }], []]);
    stubInsert(db, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true });
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true });
    expect(hashPassword).toHaveBeenCalledWith("initial-pass-123");
  });

  it("inserts with identifier_type 'staff_id' and the teacher role id", async () => {
    stubSelect(db, [[{ id: 3, name: "teacher" }], []]);
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10 }] };
      },
    }));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    expect(inserted.identifierType).toBe("staff_id");
    expect(inserted.roleId).toBe(3);
    expect(inserted.passwordHash).toBe("$2a$12$hashed");
  });

  it("trims surrounding whitespace from inputs before insert", async () => {
    stubSelect(db, [[{ id: 3, name: "teacher" }], []]);
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10 }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        fullName: "  Ibrahim, S.  ",
        staffId: " STF-014 ",
        password: "initial-pass-123",
      }),
    );
    expect(res.status).toBe(201);
    expect(inserted.fullName).toBe("Ibrahim, S.");
    expect(inserted.identifier).toBe("STF-014");
  });

  it("returns 409 when the staff ID is already taken", async () => {
    stubSelect(db, [[{ id: 3, name: "teacher" }], [{ id: 7 }]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/staff ID/i);
  });

  it("returns 422 when the teacher role row does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(422);
  });

  it.each([
    ["missing full name", { staffId: "STF-014", password: "initial-pass-123" }],
    ["empty full name", { fullName: "", staffId: "STF-014", password: "initial-pass-123" }],
    ["missing staff ID", { fullName: "X", password: "initial-pass-123" }],
    ["whitespace staff ID", { fullName: "X", staffId: "   ", password: "initial-pass-123" }],
    ["staff ID over 50 chars", { fullName: "X", staffId: "S".repeat(51), password: "initial-pass-123" }],
    ["short password", { fullName: "X", staffId: "STF-014", password: "short" }],
    ["missing password", { fullName: "X", staffId: "STF-014" }],
  ])("returns 422 with details for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 409 on a concurrent unique violation", async () => {
    stubSelect(db, [[{ id: 3, name: "teacher" }], []]);
    db.insert.mockImplementation(() => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(403);
  });
});
