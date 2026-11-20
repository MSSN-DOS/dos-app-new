import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { jsonRequest, makeDbMock, stubDelete, stubInsert, stubSelect, type DbMock } from "@/lib/testing/route-test";
const { getDb, requireAuth, upload, remove, sign } = vi.hoisted(() => ({ getDb: vi.fn(), requireAuth: vi.fn(), upload: vi.fn(), remove: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb })); vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/storage/supabase-storage", () => ({ uploadQuizImageObject: upload, removeQuizImageObject: remove, createQuizImageSignedUrl: sign }));
import { DELETE, GET, POST } from "./route";
let db: DbMock;
const path = "question-bank/1/abc-123.png";
const uploadRequest = (blob: NodeBlob | null) => { const req = jsonRequest("http://localhost/x", "POST"); Object.defineProperty(req, "formData", { value: async () => ({ get: () => blob }) }); return req; };
beforeEach(() => { vi.clearAllMocks(); db = makeDbMock(); getDb.mockReturnValue(db); requireAuth.mockResolvedValue({ userId: 1, roleName: "admin" }); stubInsert(db, { id: 1 }); stubDelete(db, null); sign.mockImplementation(async path => `https://example.supabase.co/storage/v1/object/sign/quiz-images/${path}?token=test`); });
describe("private bank images", () => {
  it.each([GET, POST, DELETE])("requires auth", async handler => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError()); expect((await handler(jsonRequest("http://localhost/x"))).status).toBe(401);
  });
  it.each([GET, POST, DELETE])("requires Teacher/Admin", async handler => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError()); expect((await handler(jsonRequest("http://localhost/x"))).status).toBe(403);
  });
  it("renews owned image links", async () => {
    stubSelect(db, [[{ objectPath: path }]]); const res = await GET(jsonRequest("http://localhost/x"));
    expect(res.status).toBe(200); expect((await res.json()).data[0].path).toBe(path);
  });
  it("uploads and registers a genuine PNG", async () => {
    const res = await POST(uploadRequest(new NodeBlob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: "image/png" })));
    expect(res.status).toBe(201); expect((await res.json()).data.path).toMatch(/^question-bank\/1\/.+\.png$/);
    expect(upload).toHaveBeenCalledOnce(); expect(db.insert).toHaveBeenCalledOnce();
  });
  it.each([null, new NodeBlob(["bad"], { type: "image/png" }), new NodeBlob(["svg"], { type: "image/svg+xml" })])("rejects invalid uploads with field errors", async blob => {
    const res = await POST(uploadRequest(blob)); expect(res.status).toBe(422); expect((await res.json()).error.details.length).toBeGreaterThan(0);
    expect(upload).not.toHaveBeenCalled();
  });
  it("removes an unreferenced owned image", async () => {
    stubSelect(db, [[{ id: 1, objectPath: path }], [], [], []]);
    expect((await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }))).status).toBe(204); expect(remove).toHaveBeenCalledWith(path);
  });
  it("names bank references that prevent deletion", async () => {
    stubSelect(db, [[{ id: 1 }], [{ body: `<img data-storage-path="${path}" src="${path}">` }], [], []]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }));
    expect(res.status).toBe(409); expect((await res.json()).error.message).toContain("bank questions, options or passages"); expect(remove).not.toHaveBeenCalled();
  });
  it("returns 404 for another owner's image", async () => {
    stubSelect(db, [[]]); expect((await DELETE(jsonRequest("http://localhost/x", "DELETE", { path }))).status).toBe(404);
  });
  it("validates removal paths", async () => {
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE", { path: "../../anything.png" }));
    expect(res.status).toBe(422); expect((await res.json()).error.details.length).toBeGreaterThan(0);
  });
});
