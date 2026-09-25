import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

const QUIZ_ALGEBRA = {
  id: 1,
  title: "Algebra Basics",
  quizType: "course",
  weekStart: "2026-08-29",
  status: "published",
  courseCode: "MAT 101",
  subjectName: null,
};

const QUIZ_UNTOUCHED = {
  id: 2,
  title: "Trigonometry Practice",
  quizType: "topic",
  weekStart: null,
  status: "draft",
  courseCode: "MAT 101",
  subjectName: null,
};

describe("GET /api/teacher/results", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that is neither admin nor teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });

  it("tallies released and held attempts per quiz for a teacher", async () => {
    requireAuth.mockResolvedValueOnce({ userId: 5, roleId: 2, roleName: "teacher" });
    stubSelect(db, [
      [QUIZ_ALGEBRA, QUIZ_UNTOUCHED],
      [
        { quizId: 1, releasedAt: new Date("2026-08-30T10:00:00Z") },
        { quizId: 1, releasedAt: null },
        { quizId: 1, releasedAt: new Date("2026-08-30T11:00:00Z") },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          quizId: 1,
          title: "Algebra Basics",
          quizType: "course",
          weekStart: "2026-08-29",
          status: "published",
          courseCode: "MAT 101",
          subjectName: null,
          attempts: 3,
          released: 2,
          held: 1,
        },
      ],
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });

  it("omits quizzes nobody has attempted and returns an empty list when nothing was submitted", async () => {
    requireAuth.mockResolvedValueOnce({ userId: 5, roleId: 2, roleName: "teacher" });
    stubSelect(db, [[QUIZ_ALGEBRA, QUIZ_UNTOUCHED], []]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  it("serves an admin the same list without ownership scoping", async () => {
    requireAuth.mockResolvedValueOnce({ userId: 1, roleId: 1, roleName: "admin" });
    stubSelect(db, [
      [QUIZ_ALGEBRA],
      [{ quizId: 1, releasedAt: null }],
    ]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      data: [{ quizId: 1, attempts: 1, released: 0, held: 1 }],
    });
  });
});
