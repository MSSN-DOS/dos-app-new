import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

const SESSION = {
  label: "2026/27",
  harmattanStart: "2026-10-19",
  harmattanEnd: "2027-02-12",
  rainStart: "2027-03-01",
  rainEnd: "2027-07-16",
};

const SAVED = { id: 2, ...SESSION };

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/sessions", () => {
  it("returns the session calendar to an admin", async () => {
    stubSelect(db, [[SAVED]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [SAVED] });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns an empty list rather than 404 when no session has been entered", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});

describe("POST /api/admin/sessions", () => {
  it("creates a session and returns 201", async () => {
    stubSelect(db, [[]]); // no label clash
    stubInsert(db, SAVED);
    const res = await POST(jsonRequest("http://localhost/x", "POST", SESSION));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ data: SAVED });
  });

  it("returns 409 when the label already exists, naming it", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", SESSION));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("2026/27");
  });

  it("returns 409 on a unique violation from a concurrent insert", async () => {
    // Two Admins saving the same label at once both pass the pre-check; the index is the real
    // guarantee, so a 23505 here must still read as a conflict, not a 500. The pre-check
    // select still has to succeed for the route to reach the insert.
    const racing = makeDbMock();
    stubSelect(racing, [[]]);
    racing.insert = vi.fn(() => ({
      values: () => ({
        returning: async () => {
          throw Object.assign(new Error("dup"), { code: "23505" });
        },
      }),
    }));
    getDb.mockReturnValue(racing);
    const res = await POST(jsonRequest("http://localhost/x", "POST", SESSION));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("returns 422 with a named field for a malformed label", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { ...SESSION, label: "2026" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "label" })]),
    );
  });

  it("returns 422 when Rain ends before it starts", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...SESSION,
        rainStart: "2027-05-01",
        rainEnd: "2027-03-01",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "rainEnd" })]),
    );
  });

  it("returns 422 when Harmattan and Rain overlap", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { ...SESSION, rainStart: "2027-01-01" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "rainStart" })]),
    );
  });

  it("returns 422 for a date that is not YYYY-MM-DD", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { ...SESSION, harmattanStart: "19/10/2026" }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "harmattanStart" })]),
    );
  });

  it("returns 422 for an unknown field rather than silently dropping it", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { ...SESSION, isActive: true }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for an empty body", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST"));
    expect(res.status).toBe(422);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", SESSION));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", SESSION));
    expect(res.status).toBe(403);
  });
});
