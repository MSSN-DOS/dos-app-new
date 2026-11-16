import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubDelete, stubInsert, stubSelect, type DbMock } from "@/lib/testing/route-test";
const requireAuth = vi.hoisted(() => vi.fn()); const getDb = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn()); const remove = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth })); vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/storage/supabase-storage", () => ({ uploadQuizImageObject: upload, removeQuizImageObject: remove, createQuizImageSignedUrl: async (path: string) => `https://example.supabase.co/storage/v1/object/sign/quiz-images/${path}?token=test` }));
import { GET, POST, DELETE } from "./route";
let db: DbMock;
const params = { params: Promise.resolve({ id: "1" }) };
const quiz = { id: 1, title: "Quiz", status: "draft", createdBy: 5, courseId: 9, passMark: 60 };
const path = "quizzes/1/cover.png";
function uploadRequest(blob: NodeBlob | null): Request { const request = new Request("http://localhost/x", { method: "POST" }); Object.defineProperty(request, "formData", { value: async () => ({ get: () => blob }) }); return request; }
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); requireAuth.mockResolvedValue({ userId: 5, roleId: 1, roleName: "admin" }); stubSelect(db, [[quiz]]); stubInsert(db, {}); stubDelete(db, null); });
describe("private quiz images", () => {
  it.each([GET, POST, DELETE])("requires auth for %s", async (handler) => { requireAuth.mockRejectedValueOnce(new UnauthorizedError()); expect((await handler(new Request("http://localhost/x"), params)).status).toBe(401); expect(upload).not.toHaveBeenCalled(); });
  it.each([GET, POST, DELETE])("rejects disallowed roles for %s", async (handler) => { requireAuth.mockRejectedValueOnce(new ForbiddenError()); expect((await handler(new Request("http://localhost/x"), params)).status).toBe(403); });
  it("renews owner-scoped preview links", async () => {
    stubSelect(db, [[quiz], [{ path }]]);
    const res = await GET(jsonRequest("http://localhost/x"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ path, url: expect.stringContaining("/object/sign/quiz-images/") }]);
  });
  it("denies another teacher's preview links", async () => {
    requireAuth.mockResolvedValue({ userId: 6, roleName: "teacher" });
    expect((await GET(jsonRequest("http://localhost/x"), params)).status).toBe(403);
  });
  it("removes an unused cover after publishing while keeping referenced covers protected", async () => {
    const published = { ...quiz, status: "published" };
    stubSelect(db, [[published], [{ id: 4, objectPath: path }], [published], [], []]);
    expect((await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }), params)).status).toBe(204);
    stubSelect(db, [[published], [{ id: 4, objectPath: path }], [{ ...published, coverImagePath: path }], [], []]);
    expect((await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }), params)).status).toBe(409);
  });
  it("uploads a validated PNG and returns its stable path and signed preview", async () => { const response = await POST(uploadRequest(new NodeBlob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: "image/png" })), params); expect(response.status).toBe(201); const result = (await response.json()).data; expect(result.path).toMatch(/^quizzes\/1\/.+\.png$/); expect(result.url).toContain("/object/sign/quiz-images/"); expect(upload).toHaveBeenCalledOnce(); });
  it.each([null, new NodeBlob(["<svg/>"], { type: "image/svg+xml" }), new NodeBlob(["fake png"], { type: "image/png" })])("rejects absent, unsafe or mislabeled files", async (blob) => { const response = await POST(uploadRequest(blob), params); expect(response.status).toBe(422); expect((await response.json()).error.details.length).toBeGreaterThan(0); expect(upload).not.toHaveBeenCalled(); });
  it("removes an unreferenced image", async () => { stubSelect(db, [[quiz], [{ id: 4, objectPath: path }], [quiz], [], []]); const response = await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }), params); expect(response.status).toBe(204); expect(remove).toHaveBeenCalledWith(path); });
  it("blocks deletion while the cover still references the image", async () => { stubSelect(db, [[quiz], [{ id: 4, objectPath: path }], [{ ...quiz, coverImagePath: path }], [], []]); const response = await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }), params); expect(response.status).toBe(409); expect((await response.json()).error.message).toMatch(/cover or rich-text content/); expect(remove).not.toHaveBeenCalled(); });
  it("validates object paths", async () => { const response = await DELETE(jsonRequest("http://localhost/x", "DELETE", { path: "../other" }), params); expect(response.status).toBe(422); expect((await response.json()).error.details.length).toBeGreaterThan(0); });
});
