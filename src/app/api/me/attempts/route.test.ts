import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { GET } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect } from "@/lib/testing/route-test";
import type { DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
});

describe("GET /api/me/attempts", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));

    const res = await GET(jsonRequest("http://localhost/api/me/attempts"));

    expect(res.status).toBe(401);
  });

  it("returns 403 for roles outside student and aspirant", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));

    const res = await GET(jsonRequest("http://localhost/api/me/attempts"));

    expect(res.status).toBe(403);
  });

  it("omits held Course Quiz scores while returning released and Topic Quiz scores", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [
      [{ name: "student" }],
      [
        {
          id: 12,
          quizId: 8,
          attemptNumber: 2,
          score: "88.00",
          submittedAt: new Date("2026-08-24T12:00:00Z"),
          releasedAt: null,
          title: "Week 4 Course Quiz",
          quizType: "course",
          courseId: 2,
          courseCode: "MAT 101",
          topicTitle: null,
          jambSubjectId: null,
          subjectName: null,
          weekStart: "2026-08-22",
        },
        {
          id: 11,
          quizId: 8,
          attemptNumber: 1,
          score: "72.00",
          submittedAt: new Date("2026-08-23T12:00:00Z"),
          releasedAt: new Date("2026-08-24T08:00:00Z"),
          title: "Week 4 Course Quiz",
          quizType: "course",
          courseId: 2,
          courseCode: "MAT 101",
          topicTitle: null,
          jambSubjectId: null,
          subjectName: null,
          weekStart: "2026-08-22",
        },
        {
          id: 10,
          quizId: 7,
          attemptNumber: 1,
          score: "64.00",
          submittedAt: new Date("2026-08-22T12:00:00Z"),
          releasedAt: null,
          title: "Algebra Practice",
          quizType: "topic",
          courseId: 2,
          courseCode: "MAT 101",
          topicTitle: "Algebra",
          jambSubjectId: null,
          subjectName: null,
          weekStart: null,
        },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/me/attempts"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.data[0]).not.toHaveProperty("score");
    expect(body.data[0]).not.toHaveProperty("bestScore");
    expect(body.data[1]).toMatchObject({ score: 72, bestScore: 72 });
    expect(body.data[2]).toMatchObject({ score: 64, bestScore: 64 });
  });

  it("slices attempts and returns pagination metadata", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [
      [{ name: "student" }],
      [
        { id: 12, quizId: 8, attemptNumber: 1, score: "88.00", submittedAt: new Date("2026-08-24T12:00:00Z"), releasedAt: new Date("2026-08-25T08:00:00Z"), title: "First", quizType: "course", courseId: 2, courseCode: "MAT 101", topicTitle: null, jambSubjectId: null, subjectName: null, weekStart: "2026-08-22" },
        { id: 11, quizId: 7, attemptNumber: 1, score: "72.00", submittedAt: new Date("2026-08-23T12:00:00Z"), releasedAt: new Date("2026-08-24T08:00:00Z"), title: "Second", quizType: "course", courseId: 2, courseCode: "MAT 101", topicTitle: null, jambSubjectId: null, subjectName: null, weekStart: "2026-08-22" },
        { id: 10, quizId: 6, attemptNumber: 1, score: "64.00", submittedAt: new Date("2026-08-22T12:00:00Z"), releasedAt: new Date("2026-08-23T08:00:00Z"), title: "Third", quizType: "course", courseId: 2, courseCode: "MAT 101", topicTitle: null, jambSubjectId: null, subjectName: null, weekStart: "2026-08-22" },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/api/me/attempts?page=2&pageSize=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 11, title: "Second", score: 72, bestScore: 72 });
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("accepts quiz type and role-specific subject filters", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [[{ name: "aspirant" }], []]);

    const res = await GET(
      jsonRequest("http://localhost/api/me/attempts?type=topic&jambSubjectId=3"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      meta: { page: 1, pageSize: 0, total: 0, totalPages: 1 },
      filters: { courses: [], jambSubjects: [] },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["student", "aspirant"]);
  });

  it("returns 422 for invalid filters", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });

    const res = await GET(
      jsonRequest("http://localhost/api/me/attempts?type=weekly&courseId=zero"),
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
    expect(db.select).not.toHaveBeenCalled();
  });
});
