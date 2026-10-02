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

const updatedRow = {
  id: 5,
  code: "MAT 101",
  title: "Mathematics",
  levelId: 10,
  semester: "harmattan" as const,
  scopeType: "interfaculty" as const,
  departmentId: null,
  facultyId: null,
};

const validBody = {
  code: "MAT 101",
  title: "Mathematics",
  levelId: 10,
  semester: "harmattan",
  // Re-offering a course is a new row, not an edit — so the session is editable, but it is
  // still required on the payload.
  sessionId: 2,
  scopeType: "interfaculty",
  facultyIds: [3, 4],
};

describe("PATCH /api/admin/structure/courses/[id]", () => {
  // Every PATCH test needs the offering-identity clash lookup stubbed: the handler checks for a
  // colliding course (same code + level + session + semester, excluding this row) before writing,
  // and an unstubbed `db.select` would throw and turn every happy path into a 500.
  const stubNoClash = (): void => stubSelect(db, [[]]);

  it("updates the course and set-replaces its interfaculty links", async () => {
    stubNoClash();
    stubUpdate(db, updatedRow);
    stubDelete(db, null);
    const insertedLinks: Array<{ courseId: number; facultyId: number }> = [];
    db.insert.mockImplementation(() => ({
      values: (v: unknown) => ({
        returning: async () => {
          insertedLinks.push(...(v as typeof insertedLinks));
          return [];
        },
      }),
    }));
    const res = await PATCH(jsonRequest("http://localhost/x/5", "PATCH", validBody), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ...updatedRow, facultyIds: [3, 4] });
    expect(insertedLinks).toEqual([
      { courseId: 5, facultyId: 3 },
      { courseId: 5, facultyId: 4 },
    ]);
  });

  it("clears the interfaculty links when the scope changes away from interfaculty", async () => {
    stubNoClash();
    stubUpdate(db, { ...updatedRow, scopeType: "general" });
    let deleteCalled = false;
    db.delete.mockImplementation(() => ({
      where: () => ({
        returning: async () => {
          deleteCalled = true;
          return [{ courseId: 5, facultyId: 3 }];
        },
      }),
    }));
    const insertSpy = vi.fn();
    db.insert.mockImplementation(() => ({ values: insertSpy }));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", {
        ...validBody,
        scopeType: "general",
        facultyIds: undefined,
      }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 5, facultyIds: [] });
    expect(deleteCalled).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 404 when the course does not exist", async () => {
    stubNoClash();
    stubUpdate(db, null);
    const res = await PATCH(jsonRequest("http://localhost/x/99", "PATCH", validBody), {
      params: Promise.resolve({ id: "99" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when the change would collide with another offering of the same course", async () => {
    // The R-3 case: a PATCH moving an offering onto an identity that another row already holds.
    // POST has always guarded this; without the matching check here, the duplicate is written and
    // no DB constraint catches it.
    stubSelect(db, [[{ id: 7 }]]);
    const updateSpy = vi.fn();
    db.update.mockImplementation(() => updateSpy);
    const res = await PATCH(jsonRequest("http://localhost/x/5", "PATCH", validBody), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    // The message has to say *what* collided, so an admin can tell which offering to look at.
    expect(body.error.message).toMatch(/MAT 101/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("allows a PATCH that does not change the offering identity", async () => {
    // `ne(courses.id, id)` is what stops a title-only edit tripping the guard — the row being
    // edited always matches itself on the identity columns, so without the exclusion every PATCH
    // would 409 against its own row.
    stubNoClash();
    stubUpdate(db, { ...updatedRow, title: "Renamed" });
    stubDelete(db, null);
    db.insert.mockImplementation(() => ({ values: () => ({ returning: async () => [] }) }));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", { ...validBody, title: "Renamed" }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ title: "Renamed" });
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await PATCH(jsonRequest(`http://localhost/x/${id}`, "PATCH", validBody), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 422 when the scope combination violates the constraint mirror", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", {
        ...validBody,
        scopeType: "department",
        departmentId: 3,
        facultyId: 2,
      }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(jsonRequest("http://localhost/x/5", "PATCH", validBody), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(jsonRequest("http://localhost/x/5", "PATCH", validBody), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/structure/courses/[id]", () => {
  it("deletes the course and returns 204 when nothing references it", async () => {
    stubSelect(db, [[], [], []]); // no quiz, question or content refs
    stubDelete(db, { id: 5, code: "MAT 101" });
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 409 when quizzes reference the course", async () => {
    stubSelect(db, [[{ id: 9 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/quiz/i);
  });

  it("returns 409 when questions reference the course", async () => {
    stubSelect(db, [[], [{ id: 4 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/question/i);
  });

  it("returns 409 when content items reference the course", async () => {
    stubSelect(db, [[], [], [{ id: 8 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/content/i);
  });

  it("returns 404 when the course does not exist", async () => {
    stubSelect(db, [[], [], []]);
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
