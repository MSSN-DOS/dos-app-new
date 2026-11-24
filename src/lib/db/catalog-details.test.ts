import { beforeEach, expect, it, vi } from "vitest";
import { catalogDetails } from "./catalog-details";
import { makeDbMock, stubSelect } from "@/lib/testing/route-test";
const mocks = vi.hoisted(() => ({ db: vi.fn(), scope: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("./quiz-list", () => ({ listAuthoringQuizzes: mocks.list }));
vi.mock("@/lib/auth/teaching-scope", () => ({
  getTeachingScope: mocks.scope,
  isCourseAllowed: (scope: { unrestricted: boolean }) => scope.unrestricted,
}));
const auth = { userId: 1, roleId: 1, roleName: "admin" as const };
beforeEach(() => { vi.resetAllMocks(); mocks.scope.mockResolvedValue({ unrestricted: true }); mocks.list.mockResolvedValue([]); });
it("paginates course topics and course quizzes independently", async () => {
  const db = makeDbMock(); mocks.db.mockReturnValue(db);
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, title: `Topic ${i + 1}` }));
  stubSelect(db, [[{ id: 5, code: "MME 101" }], [], rows]);
  mocks.list.mockResolvedValue(rows.map(row => ({ ...row, status: "draft", questionCount: 0 })));
  const result = await catalogDetails(auth, 5, "course", 2, 3);
  expect(result?.topics.data.map(row => row.id)).toEqual(rows.slice(10, 20).map(row => row.id));
  expect(result?.quizzes.data.map(row => row.id)).toEqual([21, 22, 23]);
  expect(mocks.list).toHaveBeenCalledWith(auth, { courseId: 5, search: "", type: "course" });
});
it("blocks access to another teacher's topic before exposing its course", async () => {
  const db = makeDbMock(); mocks.db.mockReturnValue(db);
  stubSelect(db, [[{ id: 2, createdBy: 9, courseId: 5 }]]);
  await expect(catalogDetails({ ...auth, roleName: "teacher" }, 2, "topic", 1, 1)).rejects.toThrow();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("filters topic quizzes by the requested topic id and exposes empty pages", async () => {
  const db = makeDbMock(); mocks.db.mockReturnValue(db);
  stubSelect(db, [[{ id: 2, createdBy: 1, courseId: 5 }], [{ id: 5 }], []]);
  mocks.list.mockResolvedValue([{ id: 1, topicId: 3 }, { id: 2, topicId: 2 }]);
  const result = await catalogDetails(auth, 2, "topic", 1, 1);
  expect(result?.quizzes.data.map(row => row.id)).toEqual([2]);
  expect(result?.topics.meta.total).toBe(0);
});
