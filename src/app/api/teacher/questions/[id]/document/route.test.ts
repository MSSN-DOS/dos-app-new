import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubDelete, stubSelect, stubTransaction, stubUpdate, type DbMock } from "@/lib/testing/route-test";
const { getDb, requireAuth } = vi.hoisted(() => ({ getDb: vi.fn(), requireAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb })); vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
import { DELETE, GET, PUT } from "./route";
let db: DbMock;
const row = { id: 10, createdBy: 1, questionType: "essay", bodyRichText: "Explain", courseId: 3, jambSubjectId: null, topicId: null, passageId: null, status: "draft", bankRevision: 0 };
const params = { params: Promise.resolve({ id: "10" }) };
const payload = { kind: "essay", courseId: 3, questions: [{ id: 10, questionType: "essay", bodyRichText: "Explain", clientKey: "a" }] };
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); stubTransaction(db, db); stubDelete(db, null); stubUpdate(db, { id: 10 }); requireAuth.mockResolvedValue({ userId: 1, roleName: "admin" }); });
describe("bank document load/save/delete", () => {
  it.each([GET, PUT, DELETE])("requires auth", async handler => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    expect((await handler(jsonRequest("http://localhost/x"), params)).status).toBe(401);
  });
  it.each([GET, PUT, DELETE])("requires an authoring role", async handler => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    expect((await handler(jsonRequest("http://localhost/x"), params)).status).toBe(403);
  });
  it("loads an owned essay", async () => {
    stubSelect(db, [[row], [], []]); const res = await GET(jsonRequest("http://localhost/x"), params);
    expect(res.status).toBe(200); expect((await res.json()).data.kind).toBe("essay");
  });
  it("does not expose another teacher's document", async () => {
    requireAuth.mockResolvedValue({ userId: 2, roleName: "teacher" }); stubSelect(db, [[row]]);
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403);
  });
  it("saves with a matching revision", async () => {
    stubSelect(db, [[row], [], [], [{ ...row, bankRevision: 1 }], [], []]);
    const res = await PUT(jsonRequest("http://localhost/x", "PUT", { action: "draft", revision: 0, payload }), params);
    expect(res.status).toBe(200); expect((await res.json()).data.revision).toBe(1);
  });
  it("rejects stale saves", async () => {
    stubSelect(db, [[{ ...row, bankRevision: 2 }]]);
    expect((await PUT(jsonRequest("http://localhost/x", "PUT", { action: "draft", revision: 0, payload }), params)).status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("validates publish completeness with field details", async () => {
    const res = await PUT(jsonRequest("http://localhost/x", "PUT", { action: "publish", revision: 0, payload: { ...payload, questions: [{ questionType: "essay", bodyRichText: "" }] } }), params);
    expect(res.status).toBe(422); expect((await res.json()).error.details.length).toBeGreaterThan(0);
  });
  it.each(["quizzes", "recorded attempt answers"])("names %s when deletion is blocked", async blocker => {
    stubSelect(db, blocker === "quizzes" ? [[row], [{ id: 3 }]] : [[row], [], [{ id: 3 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params);
    expect(res.status).toBe(409); expect((await res.json()).error.message).toContain(blocker);
    expect(db.delete).not.toHaveBeenCalled();
  });
  it("deletes an unreferenced question", async () => {
    stubSelect(db, [[row], [], []]); expect((await DELETE(jsonRequest("http://localhost/x", "DELETE"), params)).status).toBe(204);
  });
  it("returns 404 for missing documents", async () => {
    stubSelect(db, [[]]); expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(404);
  });
});
