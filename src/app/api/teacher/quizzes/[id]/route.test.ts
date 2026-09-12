import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "./route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect, stubUpdate } from "@/lib/testing/route-test";

const { requireAuthMock, getDbMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: requireAuthMock,
}));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

let db: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2 });
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
});

const URL_ID = "http://localhost/api/teacher/quizzes/1";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

describe("GET /api/teacher/quizzes/[id]", () => {
  it("returns the quiz detail with attached questions", async () => {
    stubSelect(db, [
      [
        {
          id: 1,
          title: "Algebra Basics",
          quizType: "course",
          courseId: 1,
          topicId: null,
          jambSubjectId: null,
        },
      ],
      [{ questionId: 7, bodyRichText: "<b>Q</b>" }],
    ]);
    const res = await GET(jsonRequest(URL_ID), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: number;
      questions: { questionId: number }[];
    };
    expect(body.id).toBe(1);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]?.questionId).toBe(7);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest(URL_ID), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it.each(["abc", "0"])("400s on invalid id %s", async (id) => {
    const res = await GET(jsonRequest("http://localhost/x"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(jsonRequest(URL_ID), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await GET(jsonRequest(URL_ID), PARAMS);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/teacher/quizzes/[id]", () => {
  const coursePayload = {
    title: "Algebra Basics",
    instructions: "Do your best",
    questionCount: 50,
    timeLimitMinutes: 45,
    passMark: 60,
    allowMultipleAttempts: true,
    loseFocusPolicy: "warn",
    weekStart: "2026-08-29",
  };

  it("updates config and returns the row", async () => {
    stubSelect(db, [[{ id: 1, quizType: "course" }]]);
    stubUpdate(db, { id: 1, ...coursePayload, status: "draft" });
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", coursePayload),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeLimitMinutes: number };
    expect(body.timeLimitMinutes).toBe(45);
  });

  it("422s when a course quiz changes questionCount away from 50", async () => {
    stubSelect(db, [[{ id: 1, quizType: "course" }]]);
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", { ...coursePayload, questionCount: 10 }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { message: string }[] };
    };
    expect(body.error.details[0]?.message).toMatch(/fixed at 50/i);
  });

  it("422s when a topic quiz sends a weekStart", async () => {
    stubSelect(db, [[{ id: 1, quizType: "topic" }]]);
    const payload = {
      title: "T",
      questionCount: 10,
      timeLimitMinutes: 30,
      passMark: 50,
      allowMultipleAttempts: false,
      loseFocusPolicy: "ignore",
      weekStart: "2026-08-29",
    };
    const res = await PATCH(jsonRequest(URL_ID, "PATCH", payload), PARAMS);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { message: string }[] };
    };
    expect(body.error.details[0]?.message).toMatch(/not tied to a week/i);
  });

  it("422s when a course quiz omits weekStart", async () => {
    stubSelect(db, [[{ id: 1, quizType: "course" }]]);
    const noWeek: Record<string, unknown> = { ...coursePayload };
    delete noWeek.weekStart;
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", noWeek),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { field: string; message: string }[] };
    };
    expect(body.error.details[0]?.field).toBe("weekStart");
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", coursePayload),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("422s on schema violations (bad passMark)", async () => {
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", { ...coursePayload, passMark: 0 }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: unknown[] };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("422s when weekStart is not a Saturday", async () => {
    const res = await PATCH(
      jsonRequest(URL_ID, "PATCH", { ...coursePayload, weekStart: "2026-08-24" }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { message: string }[] };
    };
    expect(body.error.details[0]?.message).toMatch(/saturday/i);
  });

  it.each(["abc", "0", "-3"])("400s on invalid id %s", async (id) => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", {}), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(jsonRequest(URL_ID, "PATCH", {}), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await PATCH(jsonRequest(URL_ID, "PATCH", {}), PARAMS);
    expect(res.status).toBe(403);
  });
});
