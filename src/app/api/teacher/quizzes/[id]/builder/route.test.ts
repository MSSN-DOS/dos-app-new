import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  stubInsert,
  stubDelete,
  stubUpdate,
  stubTransaction,
  type DbMock,
} from "@/lib/testing/route-test";
const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getTeachingScope = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/teaching-scope", async (original) => ({
  ...(await original<typeof import("@/lib/auth/teaching-scope")>()),
  getTeachingScope,
}));
vi.mock("@/lib/storage/supabase-storage", () => ({ createQuizImageSignedUrl: vi.fn() }));
import { GET, PUT, PATCH } from "./route";
import { questions, quizQuestions } from "@/lib/db/schema";
let db: DbMock;
const params = { params: Promise.resolve({ id: "1" }) };
const quiz = {
  id: 1,
  title: "Mechanics",
  quizType: "topic",
  createdBy: 5,
  courseId: 9,
  jambSubjectId: null,
  topicId: 2,
  status: "draft",
  builderRevision: 0,
  passMark: 60,
};
const payload = {
  details: { title: "Mechanics" },
  questions: [{ questionType: "essay", bodyRichText: "Explain equilibrium", marks: 5 }],
};

describe("publication lifecycle and grading history", () => {
  it("unpublishes legacy attempted quizzes and persists their content lock", async () => {
    const persisted = vi.fn(() => ({
      where: () => ({ returning: async () => [{ id: 1, attemptsStarted: true }] }),
    }));
    db.update.mockReturnValue({ set: persisted });
    stubSelect(db, [
      [{ ...quiz, status: "published", attemptsStarted: false }],
      [],
      [],
      [{ id: 42 }],
    ]);
    const response = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { action: "unpublish", revision: 0 }),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { status: "draft", revision: 1, hasAttempts: true },
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(persisted).toHaveBeenCalledWith(
      expect.objectContaining({ attemptsStarted: true }),
    );
  });
  it("republishes the saved content and preserves its attempt lock", async () => {
    stubSelect(db, [
      [{ ...quiz, attemptsStarted: true }],
      [{ id: 12, questionType: "essay", bodyRichText: "Explain", marks: 4 }],
      [],
      [],
      [],
    ]);
    const response = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { action: "republish", revision: 0 }),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { status: "published", revision: 1, hasAttempts: true },
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("rejects attempted-content edits after Unpublish", async () => {
    stubSelect(db, [[{ ...quiz, attemptsStarted: true }]]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", { action: "draft", revision: 0, payload }),
      params,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/grading history/);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("also protects attempts created before the attempt-lock column existed", async () => {
    stubSelect(db, [[quiz], [{ id: 42 }]]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", { action: "draft", revision: 0, payload }),
      params,
    );
    expect(response.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("rejects malformed lifecycle input with field details", async () => {
    const response = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { action: "unpublish", revision: -1 }),
      params,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "revision" })]),
    );
  });
  it("rejects stale lifecycle revisions and out-of-scope authors", async () => {
    stubSelect(db, [[{ ...quiz, status: "published" }], [], []]);
    stubUpdate(db, null);
    expect(
      (
        await PATCH(
          jsonRequest("http://localhost/x", "PATCH", {
            action: "unpublish",
            revision: 0,
          }),
          params,
        )
      ).status,
    ).toBe(409);
    stubSelect(db, [[{ ...quiz, status: "published" }], [], []]);
    getTeachingScope.mockResolvedValue({
      unrestricted: false,
      courseIds: [],
      jambSubjectIds: [],
    });
    expect(
      (
        await PATCH(
          jsonRequest("http://localhost/x", "PATCH", {
            action: "unpublish",
            revision: 0,
          }),
          params,
        )
      ).status,
    ).toBe(403);
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  getTeachingScope.mockResolvedValue({
    unrestricted: false,
    courseIds: [9],
    jambSubjectIds: [],
  });
  stubTransaction(db, db);
  stubUpdate(db, { id: 1 });
  stubInsert(db, { id: 10 });
  stubDelete(db, null);
});
describe("authenticated quiz builder", () => {
  it("saves 50 cards in batches, preserves owned IDs and copies bank IDs", async () => {
    stubSelect(db, [[{ ...quiz, quizType: "course" }], [], [], [], [{ id: 9 }]]);
    const writes: { table: unknown; rows: unknown }[] = [];
    const ids = [{ id: 9 }, ...Array.from({ length: 49 }, (_, i) => ({ id: 20 + i }))];
    db.insert.mockImplementation((table: unknown) => ({
      values: (rows: unknown) => {
        writes.push({ table, rows });
        const returning = async () => [...ids].reverse();
        return Object.assign(Promise.resolve(ids), {
          returning,
          onConflictDoUpdate: () => Object.assign(Promise.resolve(ids), { returning }),
        });
      },
    }));
    const cards = Array.from({ length: 50 }, (_, i) => ({
      id: i === 0 ? 9 : i === 1 ? 999 : undefined,
      clientKey: `q-${i}`,
      questionType: "essay",
      bodyRichText: `Q ${i}`,
      marks: i + 1,
    }));
    const res = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "draft",
        revision: 0,
        payload: { details: { title: "Mechanics" }, questions: cards },
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(writes.find((w) => w.table === questions)?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 9 }),
        expect.objectContaining({ id: undefined }),
      ]),
    );
    expect(writes.find((w) => w.table === quizQuestions)?.rows).toEqual(
      expect.arrayContaining([
        { quizId: 1, questionId: 9, sortOrder: 0, marks: 1 },
        { quizId: 1, questionId: 20, sortOrder: 1, marks: 2 },
      ]),
    );
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.delete).toHaveBeenCalledTimes(3);
  });
  it.each([GET, PUT, PATCH])("returns 401 for %s", async (handler) => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    expect((await handler(jsonRequest("http://localhost/x"), params)).status).toBe(401);
  });
  it.each([GET, PUT, PATCH])(
    "returns 403 for disallowed roles for %s",
    async (handler) => {
      requireAuth.mockRejectedValueOnce(new ForbiddenError());
      expect((await handler(jsonRequest("http://localhost/x"), params)).status).toBe(403);
    },
  );
  it("reads a draft with no questions", async () => {
    stubSelect(db, [[quiz], [], [], []]);
    const response = await GET(jsonRequest("http://localhost/x"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.questions).toEqual([]);
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });
  it("preserves a passage with no sub-questions when reading drafts", async () => {
    stubSelect(db, [[quiz], [], [{ id: 3, title: "", bodyRichText: "" }], []]);
    const response = await GET(jsonRequest("http://localhost/x"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.passages).toHaveLength(1);
  });
  it("saves an incomplete draft transactionally", async () => {
    stubSelect(db, [[quiz], [], [], [], []]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "draft",
        revision: 0,
        payload: {
          details: { title: "Mechanics" },
          questions: [{ questionType: "options", bodyRichText: "" }],
        },
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("publishes complete essays while preserving the teacher grading requirement", async () => {
    stubSelect(db, [[quiz], [], [], [], []]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "publish",
        revision: 0,
        payload,
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { revision: 1, status: "published", questionIds: [10], passageIds: {} },
    });
  });
  it("blocks incomplete publication with field details", async () => {
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "publish",
        revision: 0,
        payload: {
          ...payload,
          questions: [{ questionType: "options", bodyRichText: "<p></p>" }],
        },
      }),
      params,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.details.length).toBeGreaterThan(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("keeps Course Quizzes fixed at exactly 50 questions", async () => {
    stubSelect(db, [[{ ...quiz, quizType: "course" }], []]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "publish",
        revision: 0,
        payload,
      }),
      params,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toMatch(/50/);
  });
  it.each([{ ...quiz, createdBy: 6 }, quiz])(
    "enforces ownership and teaching scope",
    async (row) => {
      stubSelect(db, [[row], []]);
      getTeachingScope.mockResolvedValue({
        unrestricted: false,
        courseIds: [],
        jambSubjectIds: [],
      });
      const response = await PUT(
        jsonRequest("http://localhost/x", "PUT", {
          action: "draft",
          revision: 0,
          payload,
        }),
        params,
      );
      expect(response.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    },
  );
  it("rejects published quiz edits", async () => {
    stubSelect(db, [[{ ...quiz, status: "published" }], []]);
    expect(
      (
        await PUT(
          jsonRequest("http://localhost/x", "PUT", {
            action: "draft",
            revision: 0,
            payload,
          }),
          params,
        )
      ).status,
    ).toBe(409);
  });
  it("rejects stale revisions", async () => {
    stubSelect(db, [[quiz], [], []]);
    stubUpdate(db, null);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", { action: "draft", revision: 0, payload }),
      params,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/another session/);
  });
  it("does not accept an image uploaded to another quiz", async () => {
    stubSelect(db, [[quiz], [], []]);
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        action: "draft",
        revision: 0,
        payload: {
          ...payload,
          details: { title: "Mechanics", coverImagePath: "quizzes/2/cover.png" },
        },
      }),
      params,
    );
    expect(response.status).toBe(422);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("reports uniqueness conflicts as 409", async () => {
    stubSelect(db, [[quiz], [], [], [], []]);
    db.insert.mockImplementation(() => {
      throw { code: "23505" };
    });
    expect(
      (
        await PUT(
          jsonRequest("http://localhost/x", "PUT", {
            action: "draft",
            revision: 0,
            payload,
          }),
          params,
        )
      ).status,
    ).toBe(409);
  });
});
