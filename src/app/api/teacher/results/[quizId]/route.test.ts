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

const TEACHER = { userId: 5, roleId: 2, roleName: "teacher" };
const ADMIN = { userId: 1, roleId: 1, roleName: "admin" };

function quizRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Algebra Basics",
    quizType: "course",
    weekStart: "2026-08-29",
    status: "published",
    passMark: 50,
    questionCount: 50,
    courseCode: "MAT 101",
    subjectName: null,
    createdBy: 5,
    ...overrides,
  };
}

function params(quizId: string) {
  return { params: Promise.resolve({ quizId }) };
}

describe("GET /api/teacher/results/[quizId]", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that is neither admin nor teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric quiz id", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("abc"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
  });

  it("returns 404 when the quiz does not exist", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("999"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "Quiz not found" },
    });
  });

  it("returns 404 for a quiz owned by another teacher", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[quizRow({ createdBy: 9 })]]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "Quiz not found" },
    });
  });

  it("lets an admin open a quiz a teacher owns", async () => {
    requireAuth.mockResolvedValueOnce(ADMIN);
    stubSelect(db, [[quizRow({ createdBy: 9 })], [], []]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      quiz: { id: 1, passMark: 50 },
      stats: { attempts: 0 },
      data: [],
    });
  });

  it("returns one row per person with the best RELEASED score, and hides held scores", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [
      [quizRow()],
      [
        { userId: 8, fullName: "Bello, A.", identifier: "MAT/2023/001", score: "82.00" },
        { userId: 9, fullName: "Suleiman, K.", identifier: "MAT/2023/002", score: "40.00" },
        { userId: 9, fullName: "Suleiman, K.", identifier: "MAT/2023/002", score: "60.00" },
      ],
      // Deliberately carries a score the held projection must never read — a real query
      // can't return one here, and if that ever changes the mark must still not surface.
      [{ userId: 10, fullName: "Yusuf, F.", identifier: "MAT/2023/003", score: "99.00" }],
    ]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.quiz).toEqual({
      id: 1,
      title: "Algebra Basics",
      quizType: "course",
      weekStart: "2026-08-29",
      status: "published",
      passMark: 50,
      questionCount: 50,
      courseCode: "MAT 101",
      subjectName: null,
    });
    expect(body.stats).toEqual({
      attempts: 4,
      releasedAttempts: 3,
      heldAttempts: 1,
      avgScore: 60.67,
      passRate: 66.67,
    });
    expect(body.data).toEqual([
      { userId: 8, name: "Bello, A.", identifier: "MAT/2023/001", attempts: 1, held: 0, bestScore: 82 },
      { userId: 9, name: "Suleiman, K.", identifier: "MAT/2023/002", attempts: 2, held: 0, bestScore: 60 },
      { userId: 10, name: "Yusuf, F.", identifier: "MAT/2023/003", attempts: 1, held: 1, bestScore: null },
    ]);

    // The held mark must not reach the response (DESIGN.md §4) — and it must not skew the
    // stats either: an average of all four would have been 70.25.
    expect(JSON.stringify(body)).not.toContain("99");
  });

  it("reports null avg and pass rate while every attempt is still held", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [
      [quizRow()],
      [],
      [{ userId: 10, fullName: "Yusuf, F.", identifier: "MAT/2023/003" }],
    ]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      stats: {
        attempts: 1,
        releasedAttempts: 0,
        heldAttempts: 1,
        avgScore: null,
        passRate: null,
      },
      data: [{ userId: 10, held: 1, bestScore: null }],
    });
  });

  it("ignores a released attempt whose score is null rather than crashing", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [
      [quizRow()],
      [{ userId: 8, fullName: "Bello, A.", identifier: "MAT/2023/001", score: null }],
      [],
    ]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      stats: { attempts: 1, releasedAttempts: 1, avgScore: null, passRate: null },
      data: [{ userId: 8, attempts: 1, bestScore: null }],
    });
  });
});
