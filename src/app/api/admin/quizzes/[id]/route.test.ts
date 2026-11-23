import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { quizzes } from "@/lib/db/schema";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
  stubTransaction,
} from "@/lib/testing/route-test";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getDb: vi.fn(),
  removeQuizImageObject: vi.fn(),
}));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/storage/supabase-storage", () => ({
  removeQuizImageObject: mocks.removeQuizImageObject,
}));

const weekStart = "2026-11-21";
const draft = { id: 5, title: "Metallurgy", status: "draft", weekStart, attemptsStarted: false };
const db = makeDbMock();
const tx = makeDbMock();
const remove = (body?: unknown, id = "5") =>
  DELETE(jsonRequest("http://localhost/quiz", "DELETE", body), {
    params: Promise.resolve({ id }),
  });
const archive = (body: unknown = { action: "archive" }) =>
  PATCH(jsonRequest("http://localhost/quiz", "PATCH", body), {
    params: Promise.resolve({ id: "5" }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAuth.mockResolvedValue({ userId: 10, role: "admin" });
  mocks.getDb.mockReturnValue(db);
  stubTransaction(db, tx);
  stubDelete(tx, null);
});

describe("DELETE /api/admin/quizzes/[id]", () => {
  it.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
  ])("rejects %s before opening a transaction", async (error, status) => {
    mocks.requireAuth.mockRejectedValue(error);
    expect((await remove()).status).toBe(status);
    expect((await archive()).status).toBe(status);
    expect(mocks.requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid id and 404 for a missing quiz", async () => {
    expect((await remove(undefined, "0")).status).toBe(400);
    stubSelect(tx, [[]]);
    expect((await remove()).status).toBe(404);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...draft, attemptsStarted: true }, []],
    [draft, [{ id: 71 }]],
    [{ ...draft, status: "published", attemptsStarted: true }, []],
  ])("rejects deletion of attempted quizzes even with the correct title", async (quiz, attempts) => {
    stubSelect(tx, [[quiz], attempts]);
    const response = await remove({ title: draft.title });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "QUIZ_HAS_ATTEMPTS", message: expect.stringContaining("Archive this quiz") },
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("rejects a mismatched title and reports invalid title input", async () => {
    stubSelect(tx, [[{ ...draft, status: "published" }], [], [{ ...draft, status: "published" }], []]);
    const conflict = await remove({ title: "Another quiz" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "CONFIRMATION_MISMATCH" } });
    const invalid = await remove({ title: 5 });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { details: [expect.objectContaining({ field: "title" })] },
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("deletes only quiz-owned content for an untouched draft", async () => {
    stubSelect(tx, [[draft], [], []]);
    expect((await remove()).status).toBe(204);
    expect(tx.delete).toHaveBeenCalledWith(quizzes);
    expect(tx.delete).toHaveBeenCalledTimes(4);
  });

  it("requires confirmation to delete an unattempted published quiz", async () => {
    const published = { ...draft, status: "published" };
    stubSelect(tx, [[published], [], [published], [], [{ path: "quiz/image.png" }]]);
    const response = await remove();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFIRMATION_REQUIRED" } });
    expect((await remove({ title: " metallurgy " })).status).toBe(204);
    expect(tx.delete).toHaveBeenCalledTimes(4);
    expect(mocks.removeQuizImageObject).toHaveBeenCalledWith("quiz/image.png");
  });

  it("leaves storage untouched if the database transaction fails", async () => {
    db.transaction.mockRejectedValue(new Error("Commit failed"));
    expect((await remove()).status).toBe(500);
    expect(mocks.removeQuizImageObject).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/quizzes/[id]", () => {
  it("archives an attempted quiz without deleting any records or files", async () => {
    stubSelect(tx, [[{ ...draft, status: "published" }], [{ id: 71 }]]);
    const set = vi.fn(() => ({ where: vi.fn() }));
    tx.update.mockReturnValue({ set });
    expect((await archive()).status).toBe(204);
    expect(tx.update).toHaveBeenCalledWith(quizzes);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "draft",
      unpublishedAt: expect.any(Date),
      attemptsStarted: true,
      builderRevision: expect.anything(),
    }));
    expect(tx.delete).not.toHaveBeenCalled();
    expect(mocks.removeQuizImageObject).not.toHaveBeenCalled();
  });

  it("is idempotent for a quiz that is already unpublished", async () => {
    stubSelect(tx, [[{ ...draft, attemptsStarted: true }]]);
    expect((await archive()).status).toBe(204);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects unknown actions and missing quizzes", async () => {
    const invalid = await archive({ action: "void" });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { details: [expect.objectContaining({ path: ["action"] })] },
    });
    expect(db.transaction).not.toHaveBeenCalled();
    stubSelect(tx, [[]]);
    expect((await archive()).status).toBe(404);
  });
});
