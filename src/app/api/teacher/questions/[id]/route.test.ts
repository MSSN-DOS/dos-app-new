import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { DELETE, GET, PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
});

const url = "http://localhost/x/1";

describe("GET /api/teacher/questions/[id]", () => {
  it("returns the question with its options and blanks", async () => {
    const question = { id: 1, questionType: "options", bodyRichText: "Q" };
    stubSelect(db, [[question], [{ id: 10, sortOrder: 0 }], [{ id: 20, blankIndex: 1 }]]);

    const res = await GET(jsonRequest(url, "GET"), {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.options).toHaveLength(1);
    expect(body.blanks).toHaveLength(1);
  });

  it("returns 404 when the question does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest(url, "GET"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0"])("returns 400 for invalid id %s", async (badId) => {
    const res = await GET(jsonRequest(url, "GET"), {
      params: Promise.resolve({ id: badId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a valid token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError());
    const res = await GET(jsonRequest(url, "GET"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the role is not allowed", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await GET(jsonRequest(url, "GET"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/teacher/questions/[id]", () => {
  const draftBody = {
    courseId: 2,
    questionType: "fill_in_gap",
    bodyRichText: "Updated body",
    status: "draft",
    blanks: [{ acceptedAnswer: "4" }],
  };

  it("updates a question and set-replaces its blanks", async () => {
    stubUpdate(db, { id: 1, bodyRichText: "Updated body" });
    stubDelete(db, { id: 1, bodyRichText: "x" });
    const blankValues: Record<string, unknown>[] = [];
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(v) ? v : [v];
        if (rows.length > 0 && "acceptedAnswer" in rows[0]) {
          blankValues.push(...rows);
          return { returning: async () => rows.map((r, i) => ({ id: 70 + i, ...r })) };
        }
        return { returning: async () => [] };
      },
    }));
    const res = await PATCH(jsonRequest(url, "PATCH", draftBody), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blanks).toHaveLength(1);
    expect(blankValues[0].questionId).toBe(1);
    expect(blankValues[0].blankIndex).toBe(1);
    // Old options + blanks were deleted before reinsert.
    expect(db.delete).toHaveBeenCalled();
  });

  it("returns 404 when the question does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(jsonRequest(url, "PATCH", draftBody), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (badId) => {
    const res = await PATCH(jsonRequest(url, "PATCH", draftBody), {
      params: Promise.resolve({ id: badId }),
    });
    expect(res.status).toBe(400);
  });

  it("blocks an invalid publish with 422", async () => {
    const res = await PATCH(
      jsonRequest(url, "PATCH", {
        ...draftBody,
        status: "published",
        blanks: [],
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "blanks", message: expect.stringMatching(/at least one blank/i) }),
      ]),
    );
  });

  it("rejects an unknown status value with 422", async () => {
    const res = await PATCH(
      jsonRequest(url, "PATCH", { ...draftBody, status: "nope" }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details[0].field).toBe("status");
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(jsonRequest(url, "PATCH", draftBody), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await PATCH(jsonRequest(url, "PATCH", draftBody), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/teacher/questions/[id]", () => {
  it("deletes a question with no references and returns 204", async () => {
    stubSelect(db, [[{ id: 1 }], [], []]);
    stubDelete(db, { id: 1 });
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(204);
  });

  it("blocks deletion when the question is attached to quizzes", async () => {
    stubSelect(db, [[{ id: 1 }], [{ quizId: 7 }]]);
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/quiz/i);
  });

  it("blocks deletion when the question has recorded answers", async () => {
    stubSelect(db, [[{ id: 1 }], [], [{ attemptId: 9 }]]);
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/answer/i);
  });

  it("returns 404 when the question does not exist", async () => {
    stubSelect(db, [[]]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["abc", "0"])("returns 400 for invalid id %s", async (badId) => {
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: badId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await DELETE(jsonRequest(url, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(403);
  });
});
