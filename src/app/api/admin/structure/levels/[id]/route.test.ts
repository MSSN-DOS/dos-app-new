import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { DELETE, PATCH } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubSelect,
  stubUpdate,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PATCH /api/admin/structure/levels/[id]", () => {
  it("updates a level and returns 200", async () => {
    stubUpdate(db, { id: 1, value: 150 });
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { value: 150 }), ctx("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 1, value: 150 });
  });

  it("returns 404 when the level does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { value: 150 }), ctx("99"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-3"])("returns 400 for malformed id %s", async (id) => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { value: 100 }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("returns 422 for an invalid body", async () => {
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", { value: -5 }), ctx("1"));
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/admin/structure/levels/[id]", () => {
  it("deletes an unreferenced level and returns 204", async () => {
    // Two reference checks come back empty, delete returns the deleted row.
    stubSelect(db, [[], []]);
    stubDelete(db, { id: 3, value: 300 });
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(204);
  });

  it("returns 409 and keeps the level when a department references it", async () => {
    stubSelect(db, [[{ departmentId: 7 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/department/i);
  });

  it("returns 409 when a student profile references the level", async () => {
    // First check (departments) empty, second (student profiles) hits.
    stubSelect(db, [[], [{ userId: 42 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/student/i);
  });

  it("returns 404 when the level does not exist", async () => {
    stubSelect(db, [[], []]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("99"));
    expect(res.status).toBe(404);
  });
});
