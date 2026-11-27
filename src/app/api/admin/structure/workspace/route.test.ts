import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";
import { courses, courseFaculties, topics } from "@/lib/db/schema";
const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
import { GET, POST } from "./route";

let db: DbMock;
const source = {
  id: 7,
  code: "MME 471",
  title: "Metal forming",
  levelId: 4,
  semester: "harmattan",
  sessionId: 1,
  scopeType: "interfaculty",
  facultyId: null,
  departmentId: null,
};
const copy = { action: "copy", courseId: 7, sessionId: 2, includeTopics: true };
beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  db.transaction.mockImplementation((cb) => cb(db));
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 9, roleName: "admin" });
});
describe("Structure workspace endpoint", () => {
  it.each([GET, POST])("enforces authentication and admin access", async (handler) => {
    for (const [error, status] of [
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
    ] as const) {
      requireAuth.mockRejectedValueOnce(error);
      const response = await handler(
        jsonRequest(
          "http://localhost/x",
          handler === GET ? "GET" : "POST",
          handler === POST ? copy : undefined,
        ),
      );
      expect(response.status).toBe(status);
      expect(requireAuth).toHaveBeenLastCalledWith(expect.anything(), ["admin"]);
    }
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("loads real root structure and configured sessions", async () => {
    stubSelect(db, [
      [{ id: 1, name: "Engineering" }],
      [{ id: 2, name: "MME", facultyId: 1 }],
      [{ id: 4, value: 400 }],
      [{ departmentId: 2, levelId: 4 }],
      [{ id: 1, label: "2026/27" }],
    ]);
    const response = await GET(jsonRequest("http://localhost/x"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      faculties: [{ id: 1, name: "Engineering" }],
      departments: [{ id: 2, name: "MME", facultyId: 1 }],
      levels: [{ id: 4, value: 400 }],
      departmentLevels: [{ departmentId: 2, levelId: 4 }],
      sessions: [{ id: 1, label: "2026/27" }],
    });
  });
  it("pages topic branches in deterministic batches of ten", async () => {
    stubSelect(db, [
      Array.from({ length: 23 }, (_, i) => ({ id: i + 1, title: `Topic ${i + 1}` })),
    ]);
    const response = await GET(
      jsonRequest("http://localhost/x?mode=branch&kind=course&id=7&page=2"),
    );
    const { data } = await response.json();
    expect(data.nodes).toHaveLength(10);
    expect(data.nodes[0]).toEqual({ id: 11, title: "Topic 11", kind: "topic" });
    expect(data.hasMore).toBe(true);
  });
  it.each(["faculty&id=1", "department&id=2", "level&id=4", "course"])(
    "loads course branch %s without dropping its scope",
    async (branch) => {
      stubSelect(db, [[{ ...source, sessionLabel: "2026/27", level: 400, count: 2 }]]);
      const response = await GET(
        jsonRequest(`http://localhost/x?mode=branch&kind=${branch}&sessionId=1`),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data.nodes[0]).toMatchObject({
        id: 7,
        kind: "course",
        sessionId: 1,
        subtitle: "2026/27 · 400L · harmattan",
      });
    },
  );
  it("finds descendants independently of parent names and includes their session", async () => {
    stubSelect(db, [
      [],
      [],
      [],
      [],
      [{ id: 5, title: "Rolling", sessionId: 2, code: "MME 471" }],
    ]);
    const response = await GET(jsonRequest("http://localhost/x?mode=search&q=Rolling"));
    expect((await response.json()).data.nodes).toEqual([
      { id: 5, kind: "topic", title: "Rolling", sessionId: 2, subtitle: "MME 471" },
    ]);
  });
  it("caps search groups and reports more matches", async () => {
    stubSelect(db, [
      Array.from({ length: 21 }, (_, i) => ({ id: i + 1, name: `Faculty ${i}` })),
      [],
      [],
      [],
      [],
    ]);
    const response = await GET(jsonRequest("http://localhost/x?mode=search&q=Faculty"));
    const { data } = await response.json();
    expect(data.nodes).toHaveLength(20);
    expect(data.hasMore).toBe(true);
  });
  it("returns selected course faculty links for editing", async () => {
    stubSelect(db, [[source], [{ courseId: 7, facultyId: 3 }]]);
    const response = await GET(
      jsonRequest("http://localhost/x?mode=record&kind=course&id=7"),
    );
    expect((await response.json()).data).toEqual({ ...source, facultyIds: [3] });
  });
  it("returns 404 for a deleted record", async () => {
    stubSelect(db, [[]]);
    expect(
      (await GET(jsonRequest("http://localhost/x?mode=record&kind=topic&id=7"))).status,
    ).toBe(404);
  });
  it.each([
    "page=0",
    "mode=record&kind=faculty&id=1",
    "mode=record&kind=course",
    "mode=branch&kind=topic&id=1",
    "mode=branch&kind=level",
    "sessionId=-2",
  ])("rejects invalid query %s with details", async (query) => {
    const response = await GET(jsonRequest("http://localhost/x?" + query));
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toBeInstanceOf(Array);
  });
  it("bulk-adds trimmed titles, skips existing/case duplicates and preserves numbering", async () => {
    stubSelect(db, [[source], [{ title: "Rolling" }]]);
    const values = vi.fn().mockResolvedValue([]);
    db.insert.mockReturnValue({ values });
    const response = await POST(
      jsonRequest("http://localhost/x", "POST", {
        action: "bulkTopics",
        courseId: 7,
        titles: [" rolling ", "1. Drawing", "1. drawing", "Extrusion"],
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({ added: 2, skipped: 2 });
    expect(values).toHaveBeenCalledWith([
      { title: "1. Drawing", courseId: 7, createdBy: 9 },
      { title: "Extrusion", courseId: 7, createdBy: 9 },
    ]);
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("copies scope, faculty links and optional topic titles, never quizzes", async () => {
    stubSelect(db, [
      [source],
      [{ id: 2 }],
      [],
      [{ courseId: 7, facultyId: 3 }],
      [{ title: "Rolling" }],
    ]);
    const savedValues: unknown[] = [];
    db.insert.mockImplementation(() => ({
      values: (values: unknown) => {
        savedValues.push(values);
        return { returning: async () => [{ ...source, id: 8, sessionId: 2 }] };
      },
    }));
    const response = await POST(jsonRequest("http://localhost/x", "POST", copy));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({ id: 8, sessionId: 2 });
    const { id: _id, ...course } = source;
    expect(_id).toBe(7);
    expect(savedValues).toEqual([
      { ...course, sessionId: 2 },
      [{ courseId: 8, facultyId: 3 }],
      [{ courseId: 8, title: "Rolling", createdBy: 9 }],
    ]);
    expect(db.insert.mock.calls.map(([table]) => table)).toEqual([
      courses,
      courseFaculties,
      topics,
    ]);
  });
  it("copies no topics when excluded", async () => {
    stubSelect(db, [[source], [{ id: 2 }], [], []]);
    stubInsert(db, { id: 8, sessionId: 2 });
    const response = await POST(
      jsonRequest("http://localhost/x", "POST", { ...copy, includeTopics: false }),
    );
    expect(response.status).toBe(201);
    expect(db.insert).toHaveBeenCalledOnce();
  });
  it.each([
    ["missing source", [[], [], []], 404],
    ["same session", [[{ ...source, sessionId: 2 }]], 422],
    ["missing target", [[source], []], 422],
    ["duplicate offering", [[source], [{ id: 2 }], [{ id: 8 }]], 409],
  ])("blocks %s without inserting", async (_label, rows, status) => {
    stubSelect(db, rows);
    const response = await POST(jsonRequest("http://localhost/x", "POST", copy));
    expect(response.status).toBe(status);
    expect(db.insert).not.toHaveBeenCalled();
    if (status === 409)
      expect((await response.json()).error.message).toMatch(/already exists/);
  });
  it.each([
    {},
    { ...copy, includeTopics: "yes" },
    { action: "bulkTopics", courseId: 7, titles: [] },
    { action: "bulkTopics", courseId: 7, titles: Array(101).fill("Topic") },
    { action: "bulkTopics", courseId: 7, titles: [" "] },
  ])("rejects invalid operations with details", async (body) => {
    const response = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toBeInstanceOf(Array);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("rolls back through the transaction boundary when topic copy fails", async () => {
    stubSelect(db, [[source], [{ id: 2 }], [], [], [{ title: "Rolling" }]]);
    db.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: 8, sessionId: 2 }] }),
      })
      .mockImplementationOnce(() => {
        throw new Error("write failed");
      });
    const response = await POST(jsonRequest("http://localhost/x", "POST", copy));
    expect(response.status).toBe(500);
    expect(db.transaction).toHaveBeenCalledOnce();
  });
});
