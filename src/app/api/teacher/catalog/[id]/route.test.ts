import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/db/catalog-details", () => ({ catalogDetails: mocks.details }));
const request = (query = "kind=course", id = "1") => GET(new Request(`http://localhost/details?${query}`), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: 1, roleName: "admin" }); });
it.each([[new UnauthorizedError(), 401], [new ForbiddenError(), 403]])("enforces auth", async (error, status) => {
  mocks.auth.mockRejectedValue(error);
  expect((await request()).status).toBe(status);
  expect(mocks.details).not.toHaveBeenCalled();
});
it("validates pagination before database access", async () => {
  expect((await request("kind=course&quizPage=0")).status).toBe(422);
  expect(mocks.details).not.toHaveBeenCalled();
});
it("returns details with independent pagination", async () => {
  mocks.details.mockResolvedValue({ course: { id: 1 } });
  expect((await request("kind=topic&topicPage=2&quizPage=3")).status).toBe(200);
  expect(mocks.details).toHaveBeenCalledWith({ userId: 1, roleName: "admin" }, 1, "topic", 2, 3);
});
it("returns 404 or denies unassigned courses", async () => {
  mocks.details.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  mocks.details.mockRejectedValue(new ForbiddenError());
  expect((await request()).status).toBe(403);
});
