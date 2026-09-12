import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth, studentCanAccessQuiz } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  studentCanAccessQuiz: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/quizzes/access", () => ({ studentCanAccessQuiz }));

import { GET, POST } from "./route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  stubUpdate,
} from "@/lib/testing/route-test";
import type { DbMock } from "@/lib/testing/route-test";

const URL = "http://localhost/api/quizzes/1/attempt";
const PARAMS = { params: Promise.resolve({ id: "1" }) };
const VALID_BODY = {
  answers: [{ questionId: 10, selectedOptionId: 101 }],
};

let db: DbMock;

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  db = makeDbMock();
});

function stubHappyPath(overrides: Record<string, unknown> = {}) {
  stubSelect(db, [
    [{ name: "student" }],
    [
      {
        id: 1,
        status: "published",
        allowMultipleAttempts: false,
        courseId: 5,
        jambSubjectId: null,
        ...overrides,
      },
    ],
    [
      {
        id: 77,
        attemptNumber: 1,
        startedAt: new Date(),
        submittedAt: null,
      },
    ], // open attempt
    [{ id: 10, questionType: "options" }], // attached questions
    [{ id: 101, questionId: 10, isCorrect: true }], // options
    [], // blanks
    [], // existing best score
  ]);
  stubUpdate(db, { id: 77 });
  stubInsert(db, { id: 1 });
}

describe("GET /api/quizzes/[id]/attempt", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await GET(new Request(URL), PARAMS);
    expect(res.status).toBe(401);
  });

  it("starts an attempt with server time and safe question content", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubSelect(db, [
      [{ name: "student" }],
      [{
        id: 1,
        title: "Algebra",
        instructions: "Answer every question",
        status: "published",
        questionCount: 2,
        timeLimitMinutes: 30,
        allowMultipleAttempts: true,
        loseFocusPolicy: "warn",
        courseId: 5,
        jambSubjectId: null,
      }],
      [],
      [
        { id: 10, questionType: "options", bodyRichText: "2 + 2?" },
        { id: 11, questionType: "fill_in_gap", bodyRichText: "2 + 3 = ___" },
      ],
      [
        { id: 101, questionId: 10, optionText: "4", sortOrder: 1 },
        { id: 102, questionId: 10, optionText: "5", sortOrder: 2 },
      ],
      [{ questionId: 11, blankIndex: 1 }],
    ]);
    stubInsert(db, {
      id: 77,
      attemptNumber: 1,
      startedAt: new Date("2026-08-25T10:00:00.000Z"),
    });

    const res = await GET(new Request(URL), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      attemptId: 77,
      startedAt: "2026-08-25T10:00:00.000Z",
      timeLimitMinutes: 30,
      loseFocusPolicy: "warn",
    });
    expect(body.data.questions).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/isCorrect|acceptedAnswer/);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("resumes the open attempt without resetting its start time or order", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    const startedAt = new Date(Date.now() - 60_000);
    stubSelect(db, [
      [{ name: "student" }],
      [{
        id: 1,
        title: "Algebra",
        instructions: null,
        status: "published",
        questionCount: 2,
        timeLimitMinutes: 30,
        allowMultipleAttempts: true,
        loseFocusPolicy: "ignore",
        courseId: 5,
        jambSubjectId: null,
      }],
      [{ id: 77, attemptNumber: 2, startedAt, submittedAt: null }],
      [
        { id: 10, questionType: "options", bodyRichText: "First" },
        { id: 11, questionType: "options", bodyRichText: "Second" },
      ],
      [],
      [],
    ]);

    const first = await GET(new Request(URL), PARAMS);
    const secondBody = await first.json();
    expect(secondBody.data.startedAt).toBe(startedAt.toISOString());
    expect(secondBody.data.attemptId).toBe(77);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 409 after a completed single attempt", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubSelect(db, [
      [{ name: "student" }],
      [{
        id: 1,
        title: "Algebra",
        instructions: null,
        status: "published",
        questionCount: 1,
        timeLimitMinutes: 30,
        allowMultipleAttempts: false,
        loseFocusPolicy: "ignore",
        courseId: 5,
        jambSubjectId: null,
      }],
      [{ id: 55, attemptNumber: 1, startedAt: new Date(), submittedAt: new Date() }],
    ]);

    const res = await GET(new Request(URL), PARAMS);
    expect(res.status).toBe(409);
  });
});

describe("POST /api/quizzes/[id]/attempt", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for admin/teacher roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown or unpublished quiz", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    stubSelect(db, [[{ name: "student" }], []]);

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 422 with field details for an invalid body", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    stubSelect(db, [
      [{ name: "student" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: false,
          courseId: 5,
          jambSubjectId: null,
        },
      ],
    ]);

    const res = await POST(
      jsonRequest(URL, "POST", { answers: [] }),
      PARAMS
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 409 when re-attempting a single-attempt quiz", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubSelect(db, [
      [{ name: "student" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: false,
          courseId: 5,
          jambSubjectId: null,
        },
      ],
      [{ id: 55, submittedAt: new Date() }], // completed prior attempt exists
    ]);

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/already attempted/i);
  });

  it("grades even when the server-side timer has expired (auto-submit)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T11:00:01.000Z"));
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubSelect(db, [
      [{ name: "student" }],
      [{
        id: 1,
        status: "published",
        allowMultipleAttempts: false,
        timeLimitMinutes: 30,
        courseId: 5,
        jambSubjectId: null,
      }],
      [{
        id: 77,
        attemptNumber: 1,
        startedAt: new Date("2026-08-25T10:30:00.000Z"),
        submittedAt: null,
      }],
      [{ id: 10, questionType: "options" }],
      [{ id: 101, questionId: 10, isCorrect: true }],
      [],
      [],
    ]);
    stubUpdate(db, { id: 77 });
    stubInsert(db, { id: 1 });

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);

    expect(res.status).toBe(201);
    expect((await res.json()).data.scoreStatus).toBe("held");
    expect(db.update).toHaveBeenCalled();
  });

  it("returns 409 if finalization loses a concurrent submission", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubHappyPath();
    stubUpdate(db, null);

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/already submitted/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 403 for an aspirant on a course quiz", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ name: "aspirant" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: false,
          courseId: 5,
          jambSubjectId: null,
        },
      ],
    ]);

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/aspirants/i);
  });

  it("returns 403 when the quiz is out of scope for the student", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(false);
    stubSelect(db, [
      [{ name: "student" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: false,
          courseId: 5,
          jambSubjectId: null,
        },
      ],
    ]);

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/not available to you/i);
  });

  it("grades a student submission and holds the score", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubHappyPath();

    const res = await POST(jsonRequest(URL, "POST", VALID_BODY), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({
      attemptId: 77,
      scoreStatus: "held",
      message: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toMatch(/"score"/);

    expect(db.update).toHaveBeenCalledTimes(1); // finalize open attempt
    expect(db.insert).toHaveBeenCalledTimes(2); // answers + best score
  });

  it("records attempt answers and best score on submit", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
    studentCanAccessQuiz.mockResolvedValue(true);
    stubHappyPath();

    await POST(
      jsonRequest(URL, "POST", {
        answers: [
          { questionId: 10, selectedOptionId: 999 }, // wrong option
        ],
      }),
      PARAMS
    );

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("accepts a valid aspirant submission on a JAMB quiz", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ name: "aspirant" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: true,
          courseId: null,
          jambSubjectId: 3,
        },
      ],
      [{ id: 78, attemptNumber: 1, startedAt: new Date(), submittedAt: null }],
      [{ id: 20, questionType: "options" }],
      [{ id: 201, questionId: 20, isCorrect: true }],
      [],
      [],
    ]);
    stubUpdate(db, { id: 78 });
    stubInsert(db, { id: 1 });

    const res = await POST(
      jsonRequest(URL, "POST", {
        answers: [{ questionId: 20, selectedOptionId: 201 }],
      }),
      PARAMS
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.scoreStatus).toBe("held");
    expect(JSON.stringify(body)).not.toMatch(/"score"/);
  });

  it("ignores answers for questions not attached to the quiz", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ name: "aspirant" }],
      [
        {
          id: 1,
          status: "published",
          allowMultipleAttempts: true,
          courseId: null,
          jambSubjectId: 3,
        },
      ],
      [{ id: 79, attemptNumber: 1, startedAt: new Date(), submittedAt: null }],
      [{ id: 20, questionType: "options" }],
      [{ id: 201, questionId: 20, isCorrect: true }],
      [],
      [],
    ]);
    stubUpdate(db, { id: 79 });
    stubInsert(db, { id: 1 });

    const res = await POST(
      jsonRequest(URL, "POST", {
        answers: [
          { questionId: 999, selectedOptionId: 1 }, // not attached
          { questionId: 20, selectedOptionId: 201 },
        ],
      }),
      PARAMS
    );
    expect(res.status).toBe(201);
  });
});
