import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";
const { requireAuth, getDb, access, sign } = vi.hoisted(() => ({ requireAuth: vi.fn(), getDb: vi.fn(), access: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/quizzes/access", () => ({ studentCanAccessQuiz: access }));
vi.mock("@/lib/storage/supabase-storage", () => ({ createQuizImageSignedUrl: sign }));
import { GET } from "./route";
let db: DbMock;
const params = { params: Promise.resolve({ id: "1" }) };
const quiz = { id: 1, status: "published", quizType: "topic", jambSubjectId: 3 };
const path = "quizzes/1/diagram.png";
beforeEach(() => {
  vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleName: "aspirant" }); access.mockResolvedValue(true);
  sign.mockImplementation(async (path: string) => `https://example.supabase.co/storage/v1/object/sign/quiz-images/${path}?token=fresh`);
});
describe("student image renewal", () => {
  it("requires auth", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });
  it("requires an eligible role", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403);
  });
  it("renews visible content without changing the attempt", async () => {
    stubSelect(db, [[quiz], [{ body: `<p>Question</p><img src="${path}" data-storage-path="${path}">`, passage: "Passage" }], [{ text: "Option" }], [{ objectPath: path }]]);
    const res = await GET(jsonRequest("http://localhost/x"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ path, url: expect.stringContaining("token=fresh") }]);
    expect(sign).toHaveBeenCalledExactlyOnceWith(path);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled();
  });
  it("does not sign unreferenced registered images", async () => {
    stubSelect(db, [[quiz], [{ body: "Question", passage: null }], [{ text: "Option" }]]);
    expect((await (await GET(jsonRequest("http://localhost/x"), params)).json()).data).toEqual([]);
    expect(sign).not.toHaveBeenCalled();
  });
  it("protects drafts", async () => {
    stubSelect(db, [[{ ...quiz, status: "draft" }]]);
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(404);
  });
  it("enforces academic scope", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleName: "student" }); access.mockResolvedValue(false);
    stubSelect(db, [[{ ...quiz, courseId: 3, jambSubjectId: null }]]);
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs", async () => {
    expect((await GET(jsonRequest("http://localhost/x"), { params: Promise.resolve({ id: "abc" }) })).status).toBe(400);
  });
});
