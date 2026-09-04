import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/structure/departments", () => {
  it("returns 200 with all departments when no facultyId filter is given", async () => {
    stubSelect(db, [[{ id: 1, name: "Mathematics", facultyId: 1 }]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 1, name: "Mathematics", facultyId: 1 }],
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything());
  });

  it("returns only the faculty's departments when facultyId is given", async () => {
    stubSelect(db, [[{ id: 1, name: "Mathematics", facultyId: 1 }]]);
    const res = await GET(jsonRequest("http://localhost/x?facultyId=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 1, name: "Mathematics", facultyId: 1 }],
    });
  });

  it.each([
    ["zero", "facultyId=0"],
    ["negative", "facultyId=-1"],
    ["non-numeric", "facultyId=abc"],
  ])("returns 422 for a %s facultyId", async (_label, qs) => {
    const res = await GET(jsonRequest(`http://localhost/x?${qs}`, "GET"));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });
});
