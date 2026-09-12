import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import { jsonRequest, makeDbMock, stubInsert, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/tours", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/api/tours?tourKey=teacher.dashboard", "GET"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns seen=false when the user has not completed the tour", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/api/tours?tourKey=teacher.dashboard", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { seen: false } });
  });

  it("returns seen=true when a completion row exists for this user and tour", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubSelect(db, [[{ tourKey: "teacher.dashboard" }]]);

    const res = await GET(jsonRequest("http://localhost/api/tours?tourKey=teacher.dashboard", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { seen: true } });
  });

  it("returns 422 when tourKey is missing", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });

    const res = await GET(jsonRequest("http://localhost/api/tours", "GET"));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("POST /api/tours", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/api/tours", "POST", { tourKey: "teacher.dashboard" }));
    expect(res.status).toBe(401);
  });

  it("records the completion and returns seen=true", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubInsert(db, [{ id: 1 }]);

    const res = await POST(jsonRequest("http://localhost/api/tours", "POST", { tourKey: "teacher.dashboard" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { seen: true } });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a malformed JSON body", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    const req = jsonRequest("http://localhost/api/tours", "POST", undefined);
    vi.spyOn(req, "json").mockRejectedValueOnce(new Error("bad json"));

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for a missing or invalid tourKey", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    const res = await POST(jsonRequest("http://localhost/api/tours", "POST", {}));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
