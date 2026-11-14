import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const hashPassword = vi.hoisted(() => vi.fn());
const signSession = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const rateLimitKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/password", () => ({ hashPassword }));
vi.mock("@/lib/auth/jwt", () => ({ signSession }));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit, rateLimitKey }));

import { POST } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;
let insertedValues: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  hashPassword.mockResolvedValue("hashed-password");
  signSession.mockResolvedValue("signed-token");
  rateLimitKey.mockReturnValue("register:1.2.3.4");
  checkRateLimit.mockReturnValue({ allowed: true });
  stubSelect(db, [[{ id: 3, name: "student" }]]);

  insertedValues = null;
  db.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      insertedValues = values;
      return { returning: async () => [{ id: 42, roleId: 3 }] };
    },
  }));
});

describe("POST /api/auth/register", () => {
  it("returns 429 when the caller is rate limited", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 30_000 });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "21/30GN019",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 422 with field details when a student supplies neither identifier format", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "12345678AB",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details[0].field).toBe("identifier");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 422 when an aspirant supplies a matric number", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Aspirant",
        identifier: "21/30GN019",
        password: "password123",
        role: "aspirant",
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details[0].field).toBe("identifier");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("registers a student with a matric number and mirrors it into matric_number", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "21/30GN019",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      token: "signed-token",
      user: { id: 42, roleId: 3, role: "student", identifierType: "matric_number" },
    });
    expect(insertedValues).toMatchObject({
      identifier: "21/30GN019",
      identifierType: "matric_number",
      matricNumber: "21/30GN019",
      jambRegNumber: null,
      passwordHash: "hashed-password",
    });
  });

  // The whole point of the Board decision: a Student who only holds their JAMB number today can
  // still sign up, and their account records that as the JAMB alias rather than a matric number.
  it("registers a student with a JAMB number and mirrors it into jamb_reg_number", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "202612345678AB",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.identifierType).toBe("jamb_reg_number");
    expect(insertedValues).toMatchObject({
      identifier: "202612345678AB",
      identifierType: "jamb_reg_number",
      matricNumber: null,
      jambRegNumber: "202612345678AB",
    });
  });

  it("upper-cases a lowercase identifier before storing it", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "202612345678ab",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({
      identifier: "202612345678AB",
      identifierType: "jamb_reg_number",
      matricNumber: null,
      jambRegNumber: "202612345678AB",
    });
  });

  it("registers an aspirant with a 12+2 JAMB number", async () => {
    stubSelect(db, [[{ id: 4, name: "aspirant" }]]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Aspirant",
        identifier: "202612345678JA",
        password: "password123",
        role: "aspirant",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.identifierType).toBe("jamb_reg_number");
    expect(insertedValues).toMatchObject({
      identifier: "202612345678JA",
      matricNumber: null,
      jambRegNumber: "202612345678JA",
    });
  });

  it("returns 409 when the identifier is already taken", async () => {
    db.insert.mockImplementation(() => ({
      values: () => ({
        returning: async () => {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        },
      }),
    }));

    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "21/30GN019",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 422 when the requested role does not exist", async () => {
    stubSelect(db, [[]]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/register", "POST", {
        fullName: "Test Student",
        identifier: "21/30GN019",
        password: "password123",
        role: "student",
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe("Unknown role");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
