import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect, stubTransaction, stubUpdate, type DbMock } from "@/lib/testing/route-test";
const requireAuth = vi.hoisted(() => vi.fn()); const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth })); vi.mock("@/lib/db", () => ({ getDb }));
import { POST } from "./route";
let db: DbMock;
const params = { params: Promise.resolve({ id: "1" }) };
const quiz = { id: 1, title: "Mechanics", quizType: "course", passMark: 60, createdBy: 5, builderRevision: 0, status: "draft" };
function attach(count = 50, text = "Explain") { stubSelect(db, [[quiz], Array.from({ length: count }, (_, i) => ({ id: i + 1, questionType: "essay", bodyRichText: text, marks: 1 })), [], [], []]); }
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); requireAuth.mockResolvedValue({ userId: 5, roleId: 1, roleName: "admin" }); stubTransaction(db, db); stubUpdate(db, { id: 1 }); });
describe("legacy publish shares complete validation", () => {
  it("publishes a complete 50-question course quiz", async () => { attach(); const response = await POST(jsonRequest("http://localhost/x", "POST"), params); expect(response.status).toBe(200); expect(await response.json()).toEqual({ id: 1, status: "published" }); });
  it("requires auth", async () => { requireAuth.mockRejectedValueOnce(new UnauthorizedError()); expect((await POST(jsonRequest("http://localhost/x"), params)).status).toBe(401); });
  it("requires an authoring role", async () => { requireAuth.mockRejectedValueOnce(new ForbiddenError()); expect((await POST(jsonRequest("http://localhost/x"), params)).status).toBe(403); });
  it.each([48, 51])("requires exactly 50 questions, got %s", async (count) => { attach(count); const response = await POST(jsonRequest("http://localhost/x", "POST"), params); expect(response.status).toBe(422); expect((await response.json()).error.details[0].message).toMatch(/50/); });
  it("cannot bypass empty-rich-text validation", async () => { attach(50, "<p></p>"); const response = await POST(jsonRequest("http://localhost/x", "POST"), params); expect(response.status).toBe(422); expect((await response.json()).error.details).toHaveLength(50); expect(db.update).not.toHaveBeenCalled(); });
  it("cannot bypass single-answer validation", async () => { stubSelect(db, [[{ ...quiz, quizType: "topic" }], [{ id: 2, questionType: "options", bodyRichText: "Choose", marks: 1 }], [{ questionId: 2, optionText: "A", isCorrect: true }, { questionId: 2, optionText: "B", isCorrect: true }], [], []]); const response = await POST(jsonRequest("http://localhost/x", "POST"), params); expect(response.status).toBe(422); expect((await response.json()).error.details[0].message).toMatch(/Only one/); });
  it("reports missing quiz", async () => { stubSelect(db, [[]]); expect((await POST(jsonRequest("http://localhost/x"), params)).status).toBe(404); });
  it("protects ownership", async () => { requireAuth.mockResolvedValue({ userId: 7, roleName: "teacher" }); stubSelect(db, [[quiz]]); expect((await POST(jsonRequest("http://localhost/x"), params)).status).toBe(403); });
  it("protects against stale publish requests", async () => { attach(); stubUpdate(db, null); expect((await POST(jsonRequest("http://localhost/x"), params)).status).toBe(409); });
  it("rejects invalid ids", async () => { expect((await POST(jsonRequest("http://localhost/x"), { params: Promise.resolve({ id: "bad" }) })).status).toBe(400); });
});
