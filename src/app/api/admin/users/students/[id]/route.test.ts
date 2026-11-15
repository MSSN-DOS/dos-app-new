import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, DELETE, PATCH } from "./route";
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  // DELETE records the acting admin in the audit log line, so the guard must return an identity.
  requireAuth.mockResolvedValue({ userId: 99, roleId: 1, roleName: "admin" });
});

describe("GET /api/admin/users/students/[id]", () => {
  const studentRow = [
    {
      id: 7,
      fullName: "Bello, A.",
      identifier: "MAT/2023/0142",
      isActive: true,
      departmentName: "Chemical Eng",
      facultyName: "Engineering",
      levelValue: 300,
    },
  ];

  it("returns profile, CGPA history and attempt history for an admin", async () => {
    stubSelect(db, [
      studentRow,
      [
        { weekStart: "2026-08-24", cgpaValue: "4.10" },
        { weekStart: "2026-08-17", cgpaValue: "3.80" },
      ],
      [
        {
          attemptId: 1,
          quizId: 11,
          quizTitle: "Week 1 Quiz",
          quizType: "course",
          courseCode: "CHE 301",
          attemptNumber: 1,
          score: "80.00",
          submittedAt: "2026-08-18T10:00:00Z",
          releasedAt: "2026-08-20T09:00:00Z",
        },
        {
          attemptId: 2,
          quizId: 12,
          quizTitle: "Week 2 Quiz",
          quizType: "topic",
          courseCode: null,
          attemptNumber: 1,
          score: "90.00",
          submittedAt: "2026-08-25T12:00:00Z",
          releasedAt: null,
        },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.student).toEqual(studentRow[0]);
    expect(body.currentCgpa).toBe("4.10");
    expect(body.quizzesTaken).toBe(2);
    expect(body.cgpaHistory).toHaveLength(2);
    // Held attempts are visible to Admin with released status explicit.
    expect(body.attempts[1].releasedAt).toBeNull();
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns nulls when the student has no history yet", async () => {
    stubSelect(db, [studentRow, [], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    const body = await res.json();
    expect(body.currentCgpa).toBeNull();
    expect(body.attempts).toEqual([]);
    expect(body.cgpaHistory).toEqual([]);
  });

  it("returns 404 for an unknown or non-student id", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a malformed id", async () => {
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(403);
  });
});

const studentRef = [{ id: 7, fullName: "Bello, A.", identifier: "MAT/2023/0142" }];

describe("PATCH /api/admin/users/students/[id]", () => {
  const patched = {
    id: 7,
    fullName: "Bello, A.",
    identifier: "MAT/2023/0142",
    isActive: false,
  };

  it("deactivates a student without touching their scores", async () => {
    stubSelect(db, [studentRef]);
    stubUpdate(db, patched);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      ctx("7"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(patched);
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("reactivates a student", async () => {
    stubSelect(db, [studentRef]);
    stubUpdate(db, { ...patched, isActive: true });
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: true }),
      ctx("7"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ isActive: true });
  });

  it("returns 422 with error.details when isActive is not a boolean", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: "no" }),
      ctx("7"),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([
      expect.objectContaining({ field: "isActive", code: "invalid_type" }),
    ]);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      ctx("abc"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown or non-student id", async () => {
    stubSelect(db, [[]]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      ctx("7"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Student not found");
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      ctx("7"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      ctx("7"),
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/students/[id]", () => {
  it("deletes every non-cascading reference and then the user, in FK order", async () => {
    stubSelect(db, [studentRef]);
    const tx = makeDbMock();
    stubDelete(tx, null);
    stubTransaction(db, tx);

    const res = await DELETE(
      jsonRequest("http://localhost/x", "DELETE", { identifier: studentRef[0].identifier }),
      ctx("7"),
    );

    expect(res.status).toBe(204);
    // quiz_attempts → best_scores → cgpa_records → post_utme_scores → tour_completions → users
    expect(tx.delete).toHaveBeenCalledTimes(6);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("requires confirmation before deleting", async () => {
    stubSelect(db, [studentRef]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("7"));
    expect(res.status).toBe(422);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an identifier that does not match the target student", async () => {
    stubSelect(db, [studentRef]);
    const res = await DELETE(
      jsonRequest("http://localhost/x", "DELETE", { identifier: "WRONG" }),
      ctx("7"),
    );
    expect(res.status).toBe(409);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown or non-student id and deletes nothing", async () => {
    stubSelect(db, [[]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("7"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Student not found");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each(["abc", "7abc", "2147483648"])("returns 400 for malformed id %s", async (id) => {
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx(id));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("7"));
    expect(res.status).toBe(401);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("7"));
    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
