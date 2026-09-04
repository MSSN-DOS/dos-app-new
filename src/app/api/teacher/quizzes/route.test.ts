import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";
import { jsonRequest, makeDbMock, stubSelect } from "@/lib/testing/route-test";

const { requireAuth } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth,
}));

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb,
}));

import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";

let db: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
});

describe("GET /api/teacher/quizzes", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/api/teacher/quizzes"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not allowed", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/api/teacher/quizzes"));
    expect(res.status).toBe(403);
  });

  it("returns quiz rows joined with course code and subject name", async () => {
    stubSelect(db, [
      [
        {
          id: 1,
          title: "Course Quiz — Week 4",
          quizType: "course",
          courseId: 2,
          jambSubjectId: null,
          topicId: null,
          weekStart: "2026-08-22",
          questionCount: 50,
          status: "draft",
          courseCode: "CHE 301",
          subjectName: null,
        },
        {
          id: 2,
          title: "JAMB Practice",
          quizType: "course",
          courseId: null,
          jambSubjectId: 3,
          topicId: null,
          weekStart: "2026-08-22",
          questionCount: 50,
          status: "published",
          courseCode: null,
          subjectName: "Chemistry",
        },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/api/teacher/quizzes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].courseCode).toBe("CHE 301");
    expect(body.data[1].subjectName).toBe("Chemistry");
  });

  it("slices the requested page and returns pagination metadata", async () => {
    stubSelect(db, [[
      { id: 1, title: "First", quizType: "topic" },
      { id: 2, title: "Second", quizType: "course" },
      { id: 3, title: "Third", quizType: "course" },
    ]]);
    const res = await GET(jsonRequest("http://localhost/api/teacher/quizzes?page=2&pageSize=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: 2, title: "Second", quizType: "course" }]);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("returns an empty list when no quizzes exist", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/api/teacher/quizzes?type=topic"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/teacher/quizzes", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", { title: "X" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not allowed", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError());
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", { title: "X" }),
    );
    expect(res.status).toBe(403);
  });

  it("creates a topic quiz draft shell and returns 201", async () => {
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 9, ...v }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Mass Transfer — Practice",
        quizType: "topic",
        courseId: 2,
        topicId: 7,
      }),
    );
    expect(res.status).toBe(201);
    expect(inserted).toMatchObject({
      title: "Mass Transfer — Practice",
      quizType: "topic",
      courseId: 2,
      topicId: 7,
      jambSubjectId: null,
      weekStart: null,
      timeLimitMinutes: 30,
      passMark: 50,
      status: "draft",
      createdBy: 5,
    });
  });

  it("trims the title before saving", async () => {
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 9 }] };
      },
    }));
    await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "  Padded title  ",
        quizType: "topic",
        courseId: 2,
        topicId: 7,
      }),
    );
    expect(inserted.title).toBe("Padded title");
  });

  it("creates a course quiz with a Saturday week start", async () => {
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10 }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Course Quiz — Week 4",
        quizType: "course",
        courseId: 2,
        weekStart: "2026-08-22",
      }),
    );
    expect(res.status).toBe(201);
    expect(inserted.weekStart).toBe("2026-08-22");
    expect(inserted.topicId).toBeNull();
  });

  it("creates a JAMB-subject course quiz", async () => {
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 11 }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "JAMB Chemistry — Week 1",
        quizType: "course",
        jambSubjectId: 3,
        weekStart: "2026-08-22",
      }),
    );
    expect(res.status).toBe(201);
    expect(inserted.jambSubjectId).toBe(3);
    expect(inserted.courseId).toBeNull();
  });

  it("rejects a quiz tied to both course and JAMB subject", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "topic",
        courseId: 2,
        jambSubjectId: 3,
        topicId: 7,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "jambSubjectId" }),
      ]),
    );
  });

  it("rejects a quiz with neither track", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "topic",
        topicId: 7,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "courseId" }),
      ]),
    );
  });

  it("rejects a topic quiz without a topic", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "topic",
        courseId: 2,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "topicId" }),
      ]),
    );
  });

  it("rejects a topic quiz with a week start", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "topic",
        courseId: 2,
        topicId: 7,
        weekStart: "2026-08-22",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "weekStart" }),
      ]),
    );
  });

  it("rejects a course quiz without a week start", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "course",
        courseId: 2,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "weekStart" }),
      ]),
    );
  });

  it("rejects a course quiz whose week start is not a Saturday", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "course",
        courseId: 2,
        weekStart: "2026-08-24",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "weekStart",
          message: expect.stringMatching(/saturday/i),
        }),
      ]),
    );
  });

  it("rejects a malformed week start date", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "course",
        courseId: 2,
        weekStart: "not-a-date",
      }),
    );
    expect(res.status).toBe(422);
  });

  it("rejects a missing title", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        quizType: "topic",
        courseId: 2,
        topicId: 7,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title" }),
      ]),
    );
  });

  it("rejects an unknown quiz type", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/teacher/quizzes", "POST", {
        title: "Bad",
        quizType: "weekly",
        courseId: 2,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "quizType" }),
      ]),
    );
  });
});
