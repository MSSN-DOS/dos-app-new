import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
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
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
});

const URL = "http://localhost/api/teacher/quizzes/1/questions/bulk";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

describe("POST /api/teacher/quizzes/[id]/questions/bulk", () => {
  it("attaches several published questions in one call and returns 201 with counts", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }], // quiz
      [
        { id: 7, status: "published", createdBy: 5 },
        { id: 8, status: "published", createdBy: 5 },
        { id: 9, status: "published", createdBy: 5 },
      ], // found questions
      [{ questionId: 7 }], // already attached
    ]);
    const inserted: Record<string, unknown>[] = [];
    stubInsert(db, {});
    db.insert.mockImplementation(
      (table: unknown) => {
        void table;
        return {
          values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
            const rows = Array.isArray(v) ? v : [v];
            inserted.push(...rows);
            return { returning: async () => [] };
          },
        };
      },
    );
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 8, 9] }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      data: { attached: 2, skippedAlreadyAttached: 1 },
    });
    // 7 already attached → skipped; only 8 and 9 inserted.
    expect(inserted.map((r) => r.questionId).sort()).toEqual([8, 9]);
    expect(inserted.every((r) => r.quizId === 1)).toBe(true);
  });

  it("returns 200 with attached 0 when every question is already attached", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }],
      [
        { id: 7, status: "published", createdBy: 5 },
        { id: 8, status: "published", createdBy: 5 },
      ],
      [{ questionId: 7 }, { questionId: 8 }],
    ]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 8] }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { attached: 0, skippedAlreadyAttached: 2 },
    });
  });

  it("dedupes repeated ids in the request", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }],
      [{ id: 7, status: "published", createdBy: 5 }],
      [],
    ]);
    const inserted: unknown[] = [];
    db.insert.mockImplementation(
      () => ({
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(v) ? v : [v];
          inserted.push(...rows);
          return { returning: async () => [] };
        },
      }),
    );
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 7, 7] }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      data: { attached: 1, skippedAlreadyAttached: 0 },
    });
    expect(inserted).toHaveLength(1);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7] }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it("404s naming the missing questions when some do not exist", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }],
      [{ id: 7, status: "published", createdBy: 5 }],
    ]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 999, 1000] }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("999");
    expect(body.error.message).toContain("1000");
  });

  it("403s when any selected question was created by someone else", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }],
      [
        { id: 7, status: "published", createdBy: 5 },
        { id: 8, status: "published", createdBy: 99 },
      ],
    ]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 8] }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/questions you created/i);
  });

  it("422s naming the draft questions when any is not yet published", async () => {
    stubSelect(db, [
      [{ id: 1, status: "draft", createdBy: 5 }],
      [
        { id: 7, status: "published", createdBy: 5 },
        { id: 8, status: "draft", createdBy: 5 },
      ],
    ]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7, 8] }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { message: string }[] };
    };
    expect(body.error.details[0].message).toMatch(/only published questions/i);
    expect(JSON.stringify(body.error.details)).toContain("8");
  });

  it("409s when the quiz is published", async () => {
    stubSelect(db, [[{ id: 1, status: "published", createdBy: 5 }]]);
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7] }),
      PARAMS,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/published/i);
  });

  it.each([
    {},
    { questionIds: [] },
    { questionIds: [0] },
    { questionIds: ["abc"] },
    { questionIds: [7, "x"] },
  ])("422s on invalid body %j", async (payload) => {
    const res = await POST(jsonRequest(URL, "POST", payload), PARAMS);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: unknown[] };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it.each(["abc", "0"])("400s on invalid quiz id %s", async (id) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { questionIds: [7] }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7] }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(
      jsonRequest(URL, "POST", { questionIds: [7] }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });
});
