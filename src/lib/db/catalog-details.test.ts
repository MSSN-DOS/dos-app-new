import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { catalogDetails } from "./catalog-details";
import { makeDbMock, stubSelect } from "@/lib/testing/route-test";
const mocks = vi.hoisted(() => ({ db: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("@/lib/auth/teaching-scope", () => ({
  getTeachingScope: mocks.scope,
  isCourseAllowed: (scope: { unrestricted: boolean }) => scope.unrestricted,
}));
const auth = { userId: 1, roleId: 1, roleName: "admin" as const };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ unrestricted: true });
});
it("paginates course topics and quizzes independently at the query boundary", async () => {
  const db = makeDbMock();
  mocks.db.mockReturnValue(db);
  const rows = Array.from({ length: 23 }, (_, i) => ({
    id: i + 1,
    title: "Topic " + (i + 1),
  }));
  stubSelect(db, [
    [{ id: 5, code: "MME 101" }],
    [],
    [{ total: 23 }],
    rows,
    [{ total: 23 }],
    rows,
  ]);
  const result = await catalogDetails(auth, 5, "course", 2, 3);
  expect(result?.topics.data.map((r) => r.id)).toEqual(
    rows.slice(10, 20).map((r) => r.id),
  );
  expect(result?.quizzes.data.map((r) => r.id)).toEqual([21, 22, 23]);
  expect(result?.topics.meta).toMatchObject({ page: 2, total: 23, totalPages: 3 });
  expect(result?.quizzes.meta.page).toBe(3);
});
it("blocks access to another teacher's topic before exposing its course", async () => {
  const db = makeDbMock();
  mocks.db.mockReturnValue(db);
  stubSelect(db, [[{ id: 2, createdBy: 9, courseId: 5 }]]);
  await expect(
    catalogDetails({ ...auth, roleName: "teacher" }, 2, "topic", 1, 1),
  ).rejects.toThrow();
  expect(db.select).toHaveBeenCalledOnce();
});
it("scopes topic quizzes to the selected topic and teacher ownership", async () => {
  const db = makeDbMock();
  mocks.db.mockReturnValue(db);
  stubSelect(db, [
    [{ id: 2, createdBy: 1, courseId: 5 }],
    [{ id: 5 }],
    [],
    [{ total: 0 }],
    [],
  ]);
  const conditions: unknown[] = [];
  const select = db.select.getMockImplementation()!;
  db.select.mockImplementation((...args: unknown[]) => {
    const builder = select(...args);
    const from = builder.from;
    builder.from = (...tables: unknown[]) => {
      const chain = from(...tables);
      const where = chain.where;
      chain.where = (condition: unknown) => {
        conditions.push(condition);
        return where(condition);
      };
      return chain;
    };
    return builder;
  });
  const result = await catalogDetails(
    { ...auth, roleName: "teacher" },
    2,
    "topic",
    1,
    99,
  );
  const query = new PgDialect().sqlToQuery(
    conditions.at(-1) as Parameters<PgDialect["sqlToQuery"]>[0],
  );
  expect(query.sql).toContain('"quizzes"."topic_id"');
  expect(query.sql).toContain('"quizzes"."created_by"');
  expect(query.params).toEqual(expect.arrayContaining([1, "topic", 5, 2]));
  expect(result?.quizzes).toMatchObject({
    data: [],
    meta: { page: 1, total: 0, totalPages: 1 },
  });
  expect(result?.topics.meta.total).toBe(0);
});
