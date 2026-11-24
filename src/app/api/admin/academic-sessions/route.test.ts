import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { makeDbMock, stubSelect } from "@/lib/testing/route-test";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
beforeEach(() => { vi.resetAllMocks(); });
it.each([[new UnauthorizedError(), 401], [new ForbiddenError(), 403]])("restricts session listing to admins", async (error, status) => {
  mocks.auth.mockRejectedValue(error);
  expect((await GET(new Request("http://localhost"))).status).toBe(status);
});
it("returns configured sessions including an empty state", async () => {
  const db = makeDbMock(); mocks.db.mockReturnValue(db);
  stubSelect(db, [[{ id: 1, label: "2026/27" }], []]);
  expect(await (await GET(new Request("http://localhost"))).json()).toEqual({ data: [{ id: 1, label: "2026/27" }] });
  expect(await (await GET(new Request("http://localhost"))).json()).toEqual({ data: [] });
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
});
