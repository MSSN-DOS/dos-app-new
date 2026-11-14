import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";
const requireAuth = vi.hoisted(() => vi.fn()); const getDb = vi.hoisted(() => vi.fn()); const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth })); vi.mock("@/lib/db", () => ({ getDb })); vi.mock("@/lib/quizzes/access", () => ({ studentCanAccessQuiz: access }));
import { GET } from "./route";
let db: DbMock; const params = { params: Promise.resolve({ id: "1" }) };
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); requireAuth.mockResolvedValue({ userId: 5, roleName: "student" }); access.mockResolvedValue(true); });
describe("quiz start information", () => {
  it("requires auth", async () => { requireAuth.mockRejectedValueOnce(new UnauthorizedError()); expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(401); });
  it("requires an eligible role", async () => { requireAuth.mockRejectedValueOnce(new ForbiddenError()); expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403); });
  it("shows instructions before starting without creating an attempt or leaking scores", async () => { stubSelect(db, [[{ id: 1, title: "Quiz", status: "published", quizType: "topic", timeLimitSeconds: null, passMark: 60, allowResume: true, instructions: "<p>Read first</p>" }], [{ marks: 3 }, { marks: 2 }], []]); const response = await GET(jsonRequest("http://localhost/x"), params); expect(response.status).toBe(200); const result = (await response.json()).data; expect(result.durationSeconds).toBeNull(); expect(result.totalMarks).toBe(5); expect(result.instructions).toBe("<p>Read first</p>"); expect(db.insert).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toMatch(/"score"/); });
  it("enforces student course access", async () => { access.mockResolvedValueOnce(false); stubSelect(db, [[{ id: 1, status: "published" }]]); expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403); });
  it("rejects invalid ids", async () => { expect((await GET(jsonRequest("http://localhost/x"), { params: Promise.resolve({ id: "abc" }) })).status).toBe(400); });
});
