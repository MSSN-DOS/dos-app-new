import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("PATCH /api/admin/teachers/[id]", () => {
  it("deactivates a teacher and returns the updated row", async () => {
    stubUpdate(db, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: false });
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: 10,
      fullName: "Ibrahim, S.",
      identifier: "STF-014",
      isActive: false,
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("reactivates a deactivated teacher", async () => {
    stubUpdate(db, { id: 10, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true });
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: true }),
      { params: Promise.resolve({ id: "10" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it("returns 404 when the user does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "99" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["missing isActive", {}],
    ["non-boolean isActive", { isActive: "yes" }],
  ])("returns 422 for %s", async (_label, body) => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", body), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { isActive: false }), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { isActive: false }), {
      params: Promise.resolve({ id: "10" }),
    });
    expect(res.status).toBe(403);
  });
});
