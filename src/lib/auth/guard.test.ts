import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySession = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("./jwt", () => ({ verifySession }));
vi.mock("../db", () => ({ getDb }));

import { requireAuth } from "./guard";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

const payload = { userId: 7, roleId: 2 };
const bearer = (token = "a-token") =>
  new Request("http://localhost/api/x", {
    headers: { Authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    await expect(
      requireAuth(new Request("http://localhost/api/x")),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    // No token means no account to re-read.
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header", async () => {
    const request = new Request("http://localhost/api/x", {
      headers: { Authorization: "Basic abc" },
    });
    await expect(requireAuth(request)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a token that fails verification", async () => {
    verifySession.mockRejectedValueOnce(new Error("bad signature"));
    await expect(requireAuth(bearer())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a token whose user no longer exists (hard-deleted account)", async () => {
    verifySession.mockResolvedValueOnce(payload);
    stubSelect(db, [[]]);
    await expect(requireAuth(bearer())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a token whose user has been deactivated", async () => {
    verifySession.mockResolvedValueOnce(payload);
    stubSelect(db, [[{ roleName: "student", isActive: false }]]);
    await expect(requireAuth(bearer())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError when the account exists but the role is not allowed", async () => {
    verifySession.mockResolvedValueOnce(payload);
    stubSelect(db, [[{ roleName: "student", isActive: true }]]);
    await expect(requireAuth(bearer(), ["admin"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the live role for an active, permitted account", async () => {
    verifySession.mockResolvedValueOnce(payload);
    stubSelect(db, [[{ roleName: "admin", isActive: true }]]);
    await expect(requireAuth(bearer(), ["admin"])).resolves.toEqual({
      ...payload,
      roleName: "admin",
    });
  });

  it("still re-reads the account and returns its role when no roles are required", async () => {
    verifySession.mockResolvedValueOnce(payload);
    stubSelect(db, [[{ roleName: "aspirant", isActive: true }]]);
    await expect(requireAuth(bearer())).resolves.toEqual({
      ...payload,
      roleName: "aspirant",
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
