import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const verifyPassword = vi.hoisted(() => vi.fn());
const signSession = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const rateLimitKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword }));
vi.mock("@/lib/auth/jwt", () => ({ signSession }));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit, rateLimitKey }));

import { POST } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock, type Row } from "@/lib/testing/route-test";

let db: DbMock;
let capturedWhere: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  verifyPassword.mockResolvedValue(true);
  signSession.mockResolvedValue("signed-token");
  rateLimitKey.mockReturnValue("login:21/30GN019");
  checkRateLimit.mockReturnValue({ allowed: true });
  capturedWhere = undefined;
  stubSelect(db, [[studentRow()]]);
});

function studentRow(overrides: Row = {}): Row {
  return {
    id: 8,
    roleId: 3,
    passwordHash: "hashed-password",
    isActive: true,
    role: "student",
    ...overrides,
  };
}

/**
 * The alias lookup only exists in the SQL the handler builds — the row itself comes from Postgres —
 * so this captures the `.where()` condition and walks it for column names. A regression back to the
 * pre-2026-11-10 single-column `eq(users.identifier, ...)` lookup fails here instead of quietly
 * locking students out with their second identifier.
 */
function stubSelectCapturingWhere(rows: Row[]): void {
  db.select.mockImplementation(() => ({
    from: () => ({
      innerJoin: () => ({
        where: (condition: unknown) => {
          capturedWhere = condition;
          return { orderBy: () => ({ limit: async () => rows }) };
        },
      }),
    }),
  }));
}

function columnNames(node: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 8 || node === null || typeof node !== "object") return found;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === "string") found.add(value);
    else if (value && typeof value === "object") columnNames(value, found, depth + 1);
  }
  return found;
}

describe("POST /api/auth/login", () => {
  it("returns 429 when the caller is rate limited", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 45_000 });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "21/30GN019",
        password: "password123",
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 422 when the password is missing", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", { identifier: "21/30GN019" }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 for an identifier with no matching account", async () => {
    stubSelect(db, [[]]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "21/30GN019",
        password: "password123",
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid identifier or password");
  });

  it("returns 401 for a deactivated account", async () => {
    stubSelect(db, [[studentRow({ isActive: false })]]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "21/30GN019",
        password: "password123",
      }),
    );

    expect(res.status).toBe(401);
    expect(signSession).not.toHaveBeenCalled();
  });

  it("returns 401 when the password is wrong", async () => {
    verifyPassword.mockResolvedValueOnce(false);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "21/30GN019",
        password: "wrong-password",
      }),
    );

    expect(res.status).toBe(401);
    expect(signSession).not.toHaveBeenCalled();
  });

  it("signs a student in with either identifier by searching all three columns", async () => {
    stubSelectCapturingWhere([studentRow()]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "202612345678AB",
        password: "password123",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: "signed-token",
      user: { id: 8, roleId: 3, role: "student" },
    });
    const names = columnNames(capturedWhere);
    expect(names).toContain("identifier");
    expect(names).toContain("matric_number");
    expect(names).toContain("jamb_reg_number");
  });

  it("signs an aspirant in with their JAMB number", async () => {
    stubSelect(db, [
      [{ id: 9, roleId: 4, passwordHash: "hashed-password", isActive: true, role: "aspirant" }],
    ]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        identifier: "202612345678JA",
        password: "password123",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: "signed-token",
      user: { id: 9, roleId: 4, role: "aspirant" },
    });
  });
});
