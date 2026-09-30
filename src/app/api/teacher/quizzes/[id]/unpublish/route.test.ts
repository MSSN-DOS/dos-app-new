import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
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
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
});

const URL_1 = "http://localhost/api/teacher/quizzes/1/unpublish";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

const published = { id: 1, status: "published", createdBy: 5 };

describe("POST /api/teacher/quizzes/[id]/unpublish", () => {
  it("returns the quiz to draft when nothing has been released", async () => {
    stubSelect(db, [[published], [{ count: 0 }]]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("draft");
  });

  it("409s and names the released count once a score is out", async () => {
    stubSelect(db, [[published], [{ count: 4 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/4 released score/i);
    expect(body.error.message).toMatch(/permanently frozen/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("409s when the quiz is already a draft", async () => {
    stubSelect(db, [[{ id: 1, status: "draft", createdBy: 5 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/already a draft/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets an admin unpublish a quiz they do not own", async () => {
    requireAuthMock.mockResolvedValue({ userId: 1, roleId: 1, roleName: "admin" });
    stubSelect(db, [[{ id: 1, status: "published", createdBy: 5 }], [{ count: 0 }]]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it("403s when a teacher tries to unpublish someone else's quiz", async () => {
    stubSelect(db, [[{ id: 1, status: "published", createdBy: 99 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/only unpublish quizzes you created/i);
    expect(db.update).not.toHaveBeenCalled();
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
