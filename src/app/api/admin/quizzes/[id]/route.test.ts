import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { bestScores, cgpaRecords, postUtmeScores, quizAttempts, quizzes } from "@/lib/db/schema";
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
  recomputeWeeklyScores: vi.fn(),
  removeQuizImageObject: vi.fn(),
}));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/scoring/apply-release", () => ({
  recomputeWeeklyScores: mocks.recomputeWeeklyScores,
}));
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
    [{ ...draft, status: "published" }, []],
    [{ ...draft, attemptsStarted: true }, []],
    [draft, [{ id: 71 }]],
  ])("requires title confirmation for published or attempted quizzes", async (quiz, attempts) => {
    stubSelect(tx, [[quiz], attempts]);
    const response = await remove();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFIRMATION_REQUIRED" } });
    expect(db.select).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("rejects a mismatched title and reports invalid title input", async () => {
    stubSelect(tx, [[{ ...draft, status: "published" }]]);
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

  it("deletes an untouched draft without score recalculation", async () => {
    stubSelect(tx, [[draft], [], [], []]);
    expect((await remove()).status).toBe(204);
    expect(tx.delete).toHaveBeenCalledWith(quizzes);
    expect(mocks.recomputeWeeklyScores).not.toHaveBeenCalled();
  });

  it("deletes confirmed attempts and rebuilds affected weekly scores", async () => {
    stubSelect(tx, [[{ ...draft, status: "published" }], [{ path: "quiz/image.png" }], [
      { userId: 12 }, { userId: 15 },
    ]]);
    expect((await remove({ title: " metallurgy " })).status).toBe(204);
    expect(tx.delete).toHaveBeenNthCalledWith(1, quizAttempts);
    expect(tx.delete).toHaveBeenNthCalledWith(2, bestScores);
    expect(tx.delete).toHaveBeenCalledWith(cgpaRecords);
    expect(tx.delete).toHaveBeenCalledWith(postUtmeScores);
    expect(mocks.recomputeWeeklyScores).toHaveBeenCalledWith(tx, [12, 15], weekStart);
    expect(mocks.removeQuizImageObject).toHaveBeenCalledWith("quiz/image.png");
  });

  it("leaves storage untouched if the database transaction fails", async () => {
    db.transaction.mockRejectedValue(new Error("Commit failed"));
    expect((await remove()).status).toBe(500);
    expect(mocks.removeQuizImageObject).not.toHaveBeenCalled();
  });
});
