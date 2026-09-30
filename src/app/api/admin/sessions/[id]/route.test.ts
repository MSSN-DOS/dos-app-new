import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { DELETE, GET, PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
  stubUpdate,
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

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/sessions/[id]", () => {
  it("returns the session", async () => {
    stubSelect(db, [[SAVED]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("2"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: SAVED });
  });

  it("returns 404 when the session does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("99"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a zero id", async () => {
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("0"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("2"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), params("2"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/sessions/[id]", () => {
  it("updates the dates and returns the row", async () => {
    stubSelect(db, [[]]); // no label clash
    stubUpdate(db, { ...SAVED, rainEnd: "2027-07-30" });
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { ...SESSION, rainEnd: "2027-07-30" }),
      params("2"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { ...SAVED, rainEnd: "2027-07-30" },
    });
  });

  it("returns 404 when the update matches no row", async () => {
    stubSelect(db, [[]]); // no label clash
    stubUpdate(db, null);
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", SESSION), params("99"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when renaming onto another session's label", async () => {
    stubSelect(db, [[{ id: 1 }]]);
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", SESSION), params("2"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("2026/27");
  });

  it("allows saving a session's own label unchanged", async () => {
    // The clash check excludes the row being edited, so a save that changes only the dates must
    // not collide with the session's own label.
    stubSelect(db, [[]]);
    stubUpdate(db, SAVED);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { ...SESSION, rainEnd: "2027-08-01" }),
      params("2"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 422 when the new dates are out of order", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        ...SESSION,
        harmattanStart: "2027-01-01",
        harmattanEnd: "2026-01-01",
      }),
      params("2"),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "harmattanEnd" })]),
    );
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", SESSION), params("x"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", SESSION), params("2"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", SESSION), params("2"));
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/sessions/[id]", () => {
  it("deletes an unreferenced session", async () => {
    stubSelect(db, [[{ id: 2, label: "2026/27" }], [], []]);
    stubDelete(db, { id: 2 });
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { id: 2 } });
  });

  it("returns 409 when courses still reference it, naming one", async () => {
    stubSelect(db, [[{ id: 1, label: "2025/26" }], [{ code: "CSC 201" }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    // The message has to say what blocks the delete, or the Admin is left guessing.
    expect(body.error.message).toContain("2025/26");
    expect(body.error.message).toContain("CSC 201");
  });

  it("returns 409 when it is the live manual override", async () => {
    // Deleting the session an override points at would leave every course filter matching
    // nothing — a silent total blackout.
    stubSelect(db, [[{ id: 2, label: "2026/27" }], [], [{ id: 1 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("manual override");
  });

  it("returns 404 when the session does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("99"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the delete matched no row", async () => {
    stubSelect(db, [[{ id: 2, label: "2026/27" }], [], []]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when a course was created between the check and the delete", async () => {
    // The FK is ON DELETE NO ACTION, so a race surfaces as 23503 rather than orphaning rows.
    const racing = makeDbMock();
    stubSelect(racing, [[{ id: 2, label: "2026/27" }], [], []]);
    racing.delete = vi.fn(() => ({
      where: () => {
        const promise = Promise.resolve([]) as unknown as Promise<unknown[]> & {
          returning: () => Promise<unknown[]>;
        };
        promise.returning = async () => {
          throw Object.assign(new Error("fk"), { code: "23503" });
        };
        return promise;
      },
    }));
    getDb.mockReturnValue(racing);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("Reload");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("2"));
    expect(res.status).toBe(403);
  });
});
