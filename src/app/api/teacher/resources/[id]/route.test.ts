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
});

const TEACHER = { userId: 5, roleId: 2, roleName: "teacher" };
const DRIVE_URL = "https://drive.google.com/file/d/ABCFILE123/view";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function existing(overrides: Record<string, unknown> = {}) {
  return { id: 11, type: "video", uploadedBy: 5, ...overrides };
}

describe("PATCH /api/teacher/resources/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", {}), params("11"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", {}), params("11"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    const res = await PATCH(jsonRequest("http://localhost/x", "PATCH", {}), params("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the item does not exist", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[]]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { title: "New", url: DRIVE_URL }),
      params("99"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for another teacher's link", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[existing({ uploadedBy: 9 })]]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { title: "New", url: DRIVE_URL }),
      params("11"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "Video link not found" },
    });
  });

  it("returns 404 for a non-video item, so pdf/article stay out of reach", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[existing({ type: "article" })]]);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { title: "New", url: DRIVE_URL }),
      params("11"),
    );
    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 422 for an unusable URL", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { title: "New", url: "javascript:alert(1)" }),
      params("11"),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates the title and link for the owner", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[existing()]]);
    stubUpdate(db, { id: 11, title: "Limits (corrected)", bodyOrFileUrl: DRIVE_URL });

    const res = await PATCH(
      jsonRequest("http://localhost/x", "PATCH", { title: "Limits (corrected)", url: DRIVE_URL }),
      params("11"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 11, title: "Limits (corrected)" });
  });
});

describe("DELETE /api/teacher/resources/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("11"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("11"));
    expect(res.status).toBe(403);
  });

  it("returns 404 for another teacher's link and deletes nothing", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[existing({ uploadedBy: 9 })]]);

    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("11"));
    expect(res.status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("deletes the owner's link", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[existing()]]);
    stubDelete(db, { id: 11 });

    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("11"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("lets an admin delete a teacher's link", async () => {
    requireAuth.mockResolvedValueOnce({ userId: 1, roleId: 1, roleName: "admin" });
    stubSelect(db, [[existing({ uploadedBy: 5 })]]);
    stubDelete(db, { id: 11 });

    const res = await DELETE(jsonRequest("http://localhost/x", "DELETE"), params("11"));
    expect(res.status).toBe(200);
  });
});
