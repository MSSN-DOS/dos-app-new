import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../questions/route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect } from "@/lib/testing/route-test";

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
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
});

const URL_1 = "http://localhost/api/teacher/quizzes/1/questions";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

function mockInsertThrowing(err?: Error) {
  db.insert.mockImplementation(
    () =>
      ({
        values: () => {
          if (err) throw err;
          return {};
        },
      }) as never,
  );
}

describe("POST /api/teacher/quizzes/[id]/questions", () => {
  it("attaches a question and returns 201", async () => {
    stubSelect(db, [[{ id: 1, status: "draft", createdBy: 5 }], [{ id: 7, status: "published", createdBy: 5 }]]);
    mockInsertThrowing();
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 7 }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { quizId: number; questionId: number };
    expect(body).toEqual({ quizId: 1, questionId: 7 });
  });

  it("409s when the question is already attached", async () => {
    stubSelect(db, [[{ id: 1, status: "draft", createdBy: 5 }], [{ id: 7, status: "published", createdBy: 5 }]]);
    mockInsertThrowing(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 7 }),
      PARAMS,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/already attached/i);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 7 }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it("404s when the question does not exist", async () => {
    stubSelect(db, [[{ id: 1, status: "draft", createdBy: 5 }], []]);
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 999 }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/question not found/i);
  });

  it.each([
    {},
    { questionId: 0 },
    { questionId: "abc" },
    { questionId: -1 },
  ])("422s on invalid body %j", async (payload) => {
    const res = await POST(jsonRequest(URL_1, "POST", payload), PARAMS);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: unknown[] };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it.each(["abc", "0"])("400s on invalid quiz id %s", async (id) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", {}), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 7 }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(
      jsonRequest(URL_1, "POST", { questionId: 7 }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });
});
