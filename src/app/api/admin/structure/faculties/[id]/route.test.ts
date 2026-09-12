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

describe("PATCH /api/admin/structure/faculties/[id]", () => {
  it("updates a faculty and returns 200", async () => {
    stubUpdate(db, { id: 1, name: "Engineering" });
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { name: "Engineering" }),
      ctx("1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 1, name: "Engineering" });
  });

  it("returns 404 when the faculty does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { name: "Engineering" }),
      ctx("99"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-3"])("returns 400 for malformed id %s", async (id) => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { name: "Engineering" }),
      ctx(id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for an empty name", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { name: "" }),
      ctx("1"),
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/admin/structure/faculties/[id]", () => {
  it("deletes an unreferenced faculty and returns 204", async () => {
    // Three reference checks (departments, courses, course_faculties) all come back empty.
    stubSelect(db, [[], [], []]);
    stubDelete(db, { id: 3, name: "Science" });
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(204);
  });

  it("returns 409 when a department belongs to the faculty", async () => {
    stubSelect(db, [[{ id: 7 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/department/i);
  });

  it("returns 409 when a faculty-scoped course references it", async () => {
    stubSelect(db, [[], [{ id: 8 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/course/i);
  });

  it("returns 409 when an interfaculty course_faculties link references it", async () => {
    stubSelect(db, [[], [], [{ courseId: 9 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("3"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/interfaculty/i);
  });

  it("returns 404 when the faculty does not exist", async () => {
    stubSelect(db, [[], [], []]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), ctx("99"));
    expect(res.status).toBe(404);
  });
});
