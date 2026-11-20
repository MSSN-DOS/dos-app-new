import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubDelete, stubInsert, stubSelect, stubTransaction, type DbMock } from "@/lib/testing/route-test";
const { getDb, requireAuth, scope } = vi.hoisted(() => ({ getDb: vi.fn(), requireAuth: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/auth/teaching-scope", async original => ({ ...await original<typeof import("@/lib/auth/teaching-scope")>(), getTeachingScope: scope }));
import { POST } from "./route";
let db: DbMock;
const row = { id: 10, createdBy: 1, questionType: "essay", bodyRichText: "Explain", courseId: 3, jambSubjectId: null, topicId: null, passageId: null, status: "draft", bankRevision: 1 };
const payload = { kind: "essay", courseId: 3, questions: [{ questionType: "essay", bodyRichText: "Explain", clientKey: "a" }] };
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); stubTransaction(db, db); stubInsert(db, row); stubDelete(db, null); stubSelect(db, [[row], [], []]); requireAuth.mockResolvedValue({ userId: 1, roleName: "admin" }); scope.mockResolvedValue({ unrestricted: true, courseIds: [], jambSubjectIds: [] }); });
describe("create bank document", () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])("checks auth before DB access", async error => {
    requireAuth.mockRejectedValueOnce(error);
    expect((await POST(jsonRequest("http://localhost/x", "POST", {}))).status).toBe(error instanceof UnauthorizedError ? 401 : 403);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("creates an essay without an automatic answer", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { action: "publish", revision: 0, payload }));
    expect(res.status).toBe(201); const data = (await res.json()).data;
    expect(data.questions[0].questionType).toBe("essay"); expect(data.questions[0].options).toEqual([]);
  });
  it("returns inline publish errors", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { action: "publish", revision: 0, payload: { ...payload, questions: [{ questionType: "essay", bodyRichText: "" }] } }));
    expect(res.status).toBe(422); expect((await res.json()).error.details.length).toBeGreaterThan(0);
  });
  it("rejects an unassigned track", async () => {
    scope.mockResolvedValue({ unrestricted: false, courseIds: [], jambSubjectIds: [] });
    expect((await POST(jsonRequest("http://localhost/x", "POST", { action: "draft", revision: 0, payload }))).status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("maps uniqueness conflicts to 409", async () => {
    db.insert.mockImplementationOnce(() => { throw { code: "23505" }; });
    expect((await POST(jsonRequest("http://localhost/x", "POST", { action: "draft", revision: 0, payload }))).status).toBe(409);
  });
});
