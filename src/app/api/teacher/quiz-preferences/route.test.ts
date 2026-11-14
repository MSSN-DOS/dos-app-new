import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { initialQuizSettings } from "@/lib/validation/quiz-settings";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";
const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
import { GET, PUT } from "./route";
let db: DbMock;
beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 7, roleId: 2, roleName: "teacher" });
});
describe("quiz-authoring preferences", () => {
  it.each([GET, PUT])("requires authentication for %s", async (handler) => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    expect((await handler(jsonRequest("http://localhost/x", "PUT", {}))).status).toBe(
      401,
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it.each([GET, PUT])("rejects disallowed roles for %s", async (handler) => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    expect((await handler(jsonRequest("http://localhost/x", "PUT", {}))).status).toBe(
      403,
    );
  });
  it("returns empty preferences for a new user", async () => {
    stubSelect(db, [[]]);
    const response = await GET(jsonRequest("http://localhost/x"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { defaults: null, pinned: [] } });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });
  it("reads stored defaults and pinned settings", async () => {
    const value = { defaults: initialQuizSettings, pinned: ["showCalculator"] };
    stubSelect(db, [[{ value }]]);
    const response = await GET(jsonRequest("http://localhost/x"));
    expect(await response.json()).toEqual({ data: value });
  });
  it("saves only the caller's preferences and clears quiz-specific dates", async () => {
    let captured: Record<string, unknown> = {};
    stubInsert(db, {});
    const original = db.insert.getMockImplementation()!;
    db.insert.mockImplementation((...args: unknown[]) => {
      const chain = original(...args) as {
        values: (value: Record<string, unknown>) => unknown;
      };
      return {
        values: (value: Record<string, unknown>) => {
          captured = value;
          return chain.values(value);
        },
      };
    });
    const response = await PUT(
      jsonRequest("http://localhost/x", "PUT", {
        defaults: {
          ...initialQuizSettings,
          scheduleEnabled: true,
          opensAt: "2026-11-20T09:00:00Z",
        },
        pinned: ["showCalculator", "showCalculator"],
        userId: 99,
      }),
    );
    expect(response.status).toBe(200);
    expect(captured.userId).toBe(7);
    const body = await response.json();
    expect(body.data.defaults.opensAt).toBeNull();
    expect(body.data.pinned).toEqual(["showCalculator"]);
  });
  it.each([
    { pinned: ["unknown"] },
    { defaults: { ...initialQuizSettings, requireLoginToAttempt: false } },
  ])("rejects invalid preferences with inline validation details", async (value) => {
    const response = await PUT(jsonRequest("http://localhost/x", "PUT", value));
    expect(response.status).toBe(422);
    expect((await response.json()).error.details.length).toBeGreaterThan(0);
    expect(db.insert).not.toHaveBeenCalled();
  });
  // PUT is an upsert on (user_id, key); duplicate keys are intentionally updated.
  // There is no DELETE or reference-blocking operation for these preferences.
});
