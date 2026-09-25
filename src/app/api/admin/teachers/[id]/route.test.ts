import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { tourCompletions, users } from "@/lib/db/schema";

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
  stubTransaction,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

const TEACHER_ROW = { id: 10, roleName: "teacher" };

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("PATCH /api/admin/teachers/[id]", () => {
  it("deactivates a teacher and returns the updated row", async () => {
    stubSelect(db, [[TEACHER_ROW]]);
    const tx = makeDbMock();
    stubUpdate(tx, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: false });
    stubTransaction(db, tx);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: 10,
      fullName: "Ibrahim, S.",
      identifier: "STF-014",
      isActive: false,
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("reactivates a deactivated teacher", async () => {
    stubSelect(db, [[TEACHER_ROW]]);
    const tx = makeDbMock();
    stubUpdate(tx, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true });
    stubTransaction(db, tx);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: true }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it("edits the name and replaces the assigned subjects as a set", async () => {
    stubSelect(db, [
      [TEACHER_ROW],
      [{ id: 2, code: "MAT 101", title: "Algebra" }],
      [{ id: 4, name: "Biology" }],
    ]);
    const tx = makeDbMock();
    tx.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [
            { id: 10, fullName: "Amina Lawal", identifier: "STF-014", isActive: true },
          ],
        }),
      }),
    }));
    stubDelete(tx, null);
    const assignmentValues: Record<string, unknown>[] = [];
    tx.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(v) ? v : [v];
        assignmentValues.push(...rows);
        return { returning: async () => rows.map((r, i) => ({ id: 100 + i, ...r })) };
      },
    }));
    stubTransaction(db, tx);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        fullName: "Amina Lawal",
        courseIds: [2],
        jambSubjectIds: [4],
      }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fullName).toBe("Amina Lawal");
    expect(tx.delete).toHaveBeenCalled();
    expect(assignmentValues).toEqual([
      { userId: 10, courseId: 2, jambSubjectId: null },
      { userId: 10, courseId: null, jambSubjectId: 4 },
    ]);
  });

  it("returns 404 when the user does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "99" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is not a teacher", async () => {
    stubSelect(db, [[{ id: 10, roleName: "student" }]]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when a course in the replacement set does not exist", async () => {
    stubSelect(db, [[TEACHER_ROW], []]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        courseIds: [999],
        jambSubjectIds: [4],
      }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/course/i);
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["missing everything", {}],
    ["non-boolean isActive", { isActive: "yes" }],
    ["only one assignment track", { courseIds: [2] }],
    ["empty assignment set", { courseIds: [], jambSubjectIds: [] }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", body), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { isActive: false }), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { isActive: false }), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/teachers/[id]", () => {
  it("hard-deletes a teacher with no authored content and returns 204", async () => {
    stubSelect(db, [[TEACHER_ROW], [], [], [], []]);
    const tx = makeDbMock();
    stubDelete(tx, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014" });
    stubTransaction(db, tx);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(204);
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
    // Throwaway tour rows removed first, then the user (assignments/sessions cascade).
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(tx.delete.mock.calls[0]?.[0]).toBe(tourCompletions);
    expect(tx.delete.mock.calls[1]?.[0]).toBe(users);
  });

  it("returns 409 naming quizzes when the teacher has authored content", async () => {
    stubSelect(db, [[TEACHER_ROW], [{ id: 7 }], [], [], []]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/quizzes/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 409 naming every blocker when a teacher has authored several kinds", async () => {
    stubSelect(db, [
      [TEACHER_ROW],
      [],
      [{ id: 3 }],
      [],
      [{ id: 9 }],
    ]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/questions/);
    expect(body.error.message).toMatch(/content items/);
  });

  it("returns 404 when the user does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "99" }),
    });
    expect(res.status).toBe(404);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is not a teacher", async () => {
    stubSelect(db, [[{ id: 10, roleName: "student" }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(403);
  });
});