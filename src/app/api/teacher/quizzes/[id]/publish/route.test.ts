import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
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

const URL_1 = "http://localhost/api/teacher/quizzes/1/publish";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

describe("POST /api/teacher/quizzes/[id]/publish", () => {
  it("publishes once enough questions are attached", async () => {
    const attached = Array.from({ length: 50 }, (_, i) => ({
      questionId: i + 1,
      questionStatus: "published" as const,
    }));
    stubSelect(db, [
      [{ id: 1, questionCount: 50, title: "Algebra Basics", createdBy: 5 }],
      attached,
    ]);
    db.update.mockReturnValue(
      {
        set: () => ({
          where: () => ({
            returning: async () => [{ id: 1, status: "published" }],
          }),
        }),
      } as never,
    );
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("published");
  });

  it("422s with the remaining count when under the target", async () => {
    stubSelect(db, [
      [{ id: 1, questionCount: 50, title: "Algebra Basics", createdBy: 5 }],
      Array.from({ length: 48 }, (_, i) => ({ questionId: i + 1, questionStatus: "published" as const })),
    ]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { message: string }[] };
    };
    expect(body.error.details[0]?.message).toMatch(/2 more question/i);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it.each(["abc", "0"])("400s on invalid quiz id %s", async (id) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(403);
  });
});
