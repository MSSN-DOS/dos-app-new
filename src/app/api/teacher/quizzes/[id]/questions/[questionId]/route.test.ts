import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "./route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
} from "@/lib/testing/route-test";

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

const QPARAMS = { params: Promise.resolve({ id: "1", questionId: "7" }) };

describe("DELETE /api/teacher/quizzes/[id]/questions/[questionId]", () => {
  it("detaches and returns 204", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    stubDelete(db, { quizId: 1, questionId: 7 });
    const res = await DELETE(
      jsonRequest("http://localhost/api/teacher/quizzes/1/questions/7", "DELETE"),
      QPARAMS,
    );
    expect(res.status).toBe(204);
  });

  it("404s when the link is missing", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    stubDelete(db, null);
    const res = await DELETE(
      jsonRequest("http://localhost/api/teacher/quizzes/1/questions/7", "DELETE"),
      QPARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/not attached/i);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await DELETE(
      jsonRequest("http://localhost/api/teacher/quizzes/1/questions/7", "DELETE"),
      QPARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it.each([
    ["1", "abc"],
    ["abc", "7"],
    ["0", "0"],
  ])("400s on invalid ids %s/%s", async (qid, qdid) => {
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), {
      params: Promise.resolve({ id: qid, questionId: qdid }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(
      jsonRequest("http://localhost/api/teacher/quizzes/1/questions/7", "DELETE"),
      QPARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await DELETE(
      jsonRequest("http://localhost/api/teacher/quizzes/1/questions/7", "DELETE"),
      QPARAMS,
    );
    expect(res.status).toBe(403);
  });
});
