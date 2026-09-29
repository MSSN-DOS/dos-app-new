import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;
const WEEK = "2026-08-22";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("PATCH /api/admin/quizzes/[id]/window", () => {
  it("sets an explicit open/close window and returns the effective instants", async () => {
    stubSelect(db, [[{ id: 5, quizType: "course", weekStart: WEEK }]]);
    stubUpdate(db, {
      id: 5,
      opensAt: new Date("2026-08-20T09:00:00Z"),
      closesAt: new Date("2026-08-24T22:00:00Z"),
    });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        opensAt: "2026-08-20T09:00:00Z",
        closesAt: "2026-08-24T22:00:00Z",
      }),
      ctx("5"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(5);
    expect(body.data.opensAt).toBe("2026-08-20T09:00:00.000Z");
    expect(body.data.closesAt).toBe("2026-08-24T22:00:00.000Z");
    // Effective window reflects the override, not the default Sat 00:00 -> Mon 00:00.
    expect(body.data.effective.opensAt).toBe("2026-08-20T09:00:00.000Z");
    expect(body.data.effective.closesAt).toBe("2026-08-24T22:00:00.000Z");
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("clears the override when both fields are null, restoring the default window", async () => {
    stubSelect(db, [[{ id: 5, quizType: "course", weekStart: WEEK }]]);
    stubUpdate(db, { id: 5, opensAt: null, closesAt: null });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("5"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.opensAt).toBeNull();
    expect(body.data.closesAt).toBeNull();
    // Default Saturday 00:00 WAT (UTC+1) for 2026-08-22 is 2026-08-21T23:00:00Z,
    // closing Monday 00:00 WAT is 2026-08-23T23:00:00Z.
    expect(body.data.effective.opensAt).toBe("2026-08-21T23:00:00.000Z");
    expect(body.data.effective.closesAt).toBe("2026-08-23T23:00:00.000Z");
  });

  it("keeps the default close when only opensAt is provided", async () => {
    stubSelect(db, [[{ id: 5, quizType: "course", weekStart: WEEK }]]);
    stubUpdate(db, {
      id: 5,
      opensAt: new Date("2026-08-19T10:00:00Z"),
      closesAt: null,
    });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: "2026-08-19T10:00:00Z", closesAt: null }),
      ctx("5"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.effective.opensAt).toBe("2026-08-19T10:00:00.000Z");
    expect(body.data.effective.closesAt).toBe("2026-08-23T23:00:00.000Z");
  });

  it("returns 422 with error.details when the close time is not after the open time", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        opensAt: "2026-08-24T10:00:00Z",
        closesAt: "2026-08-20T10:00:00Z",
      }),
      ctx("5"),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.some((d: { field: string }) => d.field === "closesAt")).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 422 when the body is not an object", async () => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", "nope"), ctx("5"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for a non-numeric quiz id", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("abc"),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("999"),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 409 for a Topic Quiz, naming why it has no window", async () => {
    stubSelect(db, [[{ id: 7, quizType: "topic", weekStart: null }]]);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("7"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/Course Quiz/);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("5"),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the caller is not an admin", async () => {
    const { ForbiddenError } = await import("@/lib/auth/errors");
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { opensAt: null, closesAt: null }),
      ctx("5"),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});
