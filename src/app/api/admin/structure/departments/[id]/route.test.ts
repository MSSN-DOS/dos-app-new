import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { DELETE, PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

const validBody = { name: "Computer Science", facultyId: 2, levelIds: [10, 20] };

describe("PATCH /api/admin/structure/departments/[id]", () => {
  it("updates the department and set-replaces its level links", async () => {
    stubUpdate(db, { id: 5, name: "Computer Science", facultyId: 2 });
    stubDelete(db, null);
    const insertedLinks: Array<{ departmentId: number; levelId: number }> = [];
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () => {
          insertedLinks.push(...(v as typeof insertedLinks));
          return [];
        },
      }),
    }));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(200);
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

  it("returns 404 when the department does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(
      jsonRequest("http://localhost/x/99", "PATCH", validBody),
      { params: Promise.resolve({ id: "99" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await PATCH(
      jsonRequest(`http://localhost/x/${id}`, "PATCH", validBody),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for an invalid body", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", { name: "X", facultyId: 2 }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/structure/departments/[id]", () => {
  it("deletes the department and returns 204 when nothing references it", async () => {
    stubSelect(db, [[], []]); // no course refs, no student refs
    stubDelete(db, { id: 5, name: "Physics", facultyId: 1 });
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 409 when courses reference the department", async () => {
    stubSelect(db, [[{ id: 9 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/course/i);
  });

  it("returns 409 when student profiles reference the department", async () => {
    stubSelect(db, [[], [{ userId: 7 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/student/i);
  });

  it("returns 404 when the department does not exist", async () => {
    stubSelect(db, [[], []]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest("http://localhost/x/99", "DELETE"), {
      params: Promise.resolve({ id: "99" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0"])("returns 400 for invalid id %s", async (id) => {
    const res = await DELETE(jsonRequest(`http://localhost/x/${id}`, "DELETE"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(403);
  });
});
