import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { GET } from "./route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
} from "@/lib/testing/route-test";
import type { DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
});

describe("GET /api/quizzes", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for admin/teacher roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(403);
  });

  it("lists all published JAMB-subject quizzes for an aspirant", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ name: "aspirant" }],
      [
        {
          id: 2,
          title: "JAMB Chem Drill",
          quizType: "topic",
          jambSubjectId: 3,
          subjectName: "Chemistry",
          weekStart: null,
          questionCount: 20,
          timeLimitMinutes: 30,
        },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 2,
      subjectName: "Chemistry",
      quizType: "topic",
    });
  });

  it("returns an empty list for an aspirant when nothing is published", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [[{ name: "aspirant" }], []]);

    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns 404 when a student has no profile yet", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [[{ name: "student" }], []]);

    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("scopes student quizzes to dept/faculty/general/interfaculty + level + semester", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [
      [{ name: "student" }],
      [{ departmentId: 1, levelId: 1 }],
      [{ facultyId: 2 }],
      [{ courseId: 7 }, { courseId: 8 }],
      [
        {
          id: 10,
          title: "Week 4 Quiz",
          quizType: "course",
          courseCode: "MAT 101",
          weekStart: "2026-08-29",
          questionCount: 50,
          timeLimitMinutes: 45,
        },
      ],
    ]);

    // getActiveSemester runs a separate settings select between the link rows
    // and the final quiz select — interleave it as the 5th call.
    const base = db.select.getMockImplementation();
    let call = 0;
    db.select.mockImplementation(((...args: unknown[]) => {
      call += 1;
      if (call === 5) {
        return {
          from: () => ({
            orderBy: () => ({
              limit: async () => [{ mode: "auto", manualOverride: null }],
            }),
          }),
        };
      }
      return (base as (...a: unknown[]) => unknown)(...args);
    }) as typeof db.select);

    const res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 10,
      courseCode: "MAT 101",
      weekStart: "2026-08-29",
      timeLimitMinutes: 45,
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["student", "aspirant"]);
  });

  it("returns 401 and 403 for the student branch too", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("no token"));
    let res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(401);

    requireAuth.mockRejectedValueOnce(new ForbiddenError("forbidden"));
    res = await GET(jsonRequest("http://localhost/api/quizzes"));
    expect(res.status).toBe(403);
  });
});
