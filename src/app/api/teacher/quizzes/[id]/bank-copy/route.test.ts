import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";
const { getDb, requireAuth } = vi.hoisted(() => ({ getDb: vi.fn(), requireAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb })); vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
import { POST } from "./route";
let db: DbMock; const params = { params: Promise.resolve({ id: "1" }) };
const quiz = { id: 1, createdBy: 1, status: "draft", courseId: 3, jambSubjectId: null };
const row = { id: 10, createdBy: 1, questionType: "essay", bodyRichText: "Explain", courseId: 3, jambSubjectId: null, topicId: null, passageId: null, status: "published", bankRevision: 1 };
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); requireAuth.mockResolvedValue({ userId: 1, roleName: "admin" }); });
describe("reuse a bank document", () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])("requires authorized authors", async error => {
    requireAuth.mockRejectedValueOnce(error); expect((await POST(jsonRequest("http://localhost/x", "POST", { questionId: 10 }), params)).status).toBe(error instanceof UnauthorizedError ? 401 : 403);
  });
  it("copies an essay with an independent identity", async () => {
    stubSelect(db, [[quiz], [row], [], []]); const res = await POST(jsonRequest("http://localhost/x", "POST", { questionId: 10 }), params);
    expect(res.status).toBe(201); const data = (await res.json()).data;
    expect(data.questions[0].id).toBeUndefined(); expect(data.questions[0].questionType).toBe("essay");
  });
  it("validates IDs", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { questionId: 0 }), params);
    expect(res.status).toBe(422); expect((await res.json()).error.details.length).toBeGreaterThan(0);
  });
  it("protects published quizzes", async () => {
    stubSelect(db, [[{ ...quiz, status: "published" }]]); expect((await POST(jsonRequest("http://localhost/x", "POST", { questionId: 10 }), params)).status).toBe(409);
  });
  it("prevents copying a draft bank question", async () => {
    stubSelect(db, [[quiz], [{ ...row, status: "draft" }], [], []]); const res = await POST(jsonRequest("http://localhost/x", "POST", { questionId: 10 }), params);
    expect(res.status).toBe(422); expect((await res.json()).error.details[0].field).toBe("questionId");
  });
  it("checks the quiz's academic track", async () => {
    stubSelect(db, [[quiz], [{ ...row, courseId: 4 }], [], []]); expect((await POST(jsonRequest("http://localhost/x", "POST", { questionId: 10 }), params)).status).toBe(403);
  });
});
