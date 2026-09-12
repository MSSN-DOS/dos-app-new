import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

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
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
});

const validBody = { title: "Trigonometry", courseId: 2 };

describe("PATCH /api/teacher/topics/[id]", () => {
  it("updates the topic and returns it", async () => {
    stubUpdate(db, { id: 5, title: "Trigonometry", courseId: 2, createdBy: 5 });
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 5, title: "Trigonometry", courseId: 2, createdBy: 5 });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });

  it("returns 404 when the topic does not exist", async () => {
    stubUpdate(db, null);
    const res = await PATCH(
      jsonRequest("http://localhost/x/99", "PATCH", validBody),
      { params: Promise.resolve({ id: "99" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0", "-3"])("returns 400 for invalid id %s", async (id) => {
    const res = await PATCH(
      jsonRequest(`http://localhost/x/${id}`, "PATCH", validBody),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["missing title", { courseId: 2 }],
    ["empty title", { title: "", courseId: 2 }],
    ["title over 200 chars", { title: "T".repeat(201), courseId: 2 }],
    ["missing courseId", { title: "Trigonometry" }],
    ["zero courseId", { title: "Trigonometry", courseId: 0 }],
  ])("returns 422 with details for %s", async (_label, body) => {
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", body),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await PATCH(
      jsonRequest("http://localhost/x/5", "PATCH", validBody),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/teacher/topics/[id]", () => {
  it("deletes an unreferenced topic and returns 204", async () => {
    stubSelect(db, [[{ id: 5 }], [], []]);
    stubDelete(db, { id: 5 });
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 409 when a quiz references the topic", async () => {
    stubSelect(db, [[{ id: 5 }], [{ id: 1 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/quiz/i);
  });

  it("returns 409 when a question in the bank references the topic", async () => {
    stubSelect(db, [[{ id: 5 }], [], [{ id: 3 }]]);
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/question/i);
  });

  it("returns 404 when the topic does not exist", async () => {
    stubSelect(db, [[]]);
    stubDelete(db, null);
    const res = await DELETE(jsonRequest("http://localhost/x/99", "DELETE"), {
      params: Promise.resolve({ id: "99" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each(["abc", "0"])("returns 400 for invalid id %s", async (id) => {
    const res = await DELETE(jsonRequest(`http://localhost/x/${id}`, "DELETE"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await DELETE(jsonRequest("http://localhost/x/5", "DELETE"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(403);
  });
});
