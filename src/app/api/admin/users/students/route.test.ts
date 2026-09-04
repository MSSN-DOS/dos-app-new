import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

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

describe("GET /api/admin/users/students", () => {
  it("returns the student directory with latest CGPA per student", async () => {
    stubSelect(db, [
      [
        { id: 2, fullName: "Bello, A.", identifier: "MAT/2023/0142", isActive: true, departmentName: "Chemical Eng", levelValue: 300 },
        { id: 1, fullName: "Yusuf, K.", identifier: "MAT/2023/0007", isActive: true, departmentName: "Medicine", levelValue: 500 },
      ],
      [
        { userId: 1, weekStart: "2026-08-17", cgpaValue: "3.80" },
        { userId: 1, weekStart: "2026-08-24", cgpaValue: "4.10" },
        { userId: 2, weekStart: "2026-08-24", cgpaValue: "4.21" },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 2, fullName: "Bello, A.", identifier: "MAT/2023/0142", isActive: true, departmentName: "Chemical Eng", levelValue: 300, currentCgpa: "4.21" },
        { id: 1, fullName: "Yusuf, K.", identifier: "MAT/2023/0007", isActive: true, departmentName: "Medicine", levelValue: 500, currentCgpa: "4.10" },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns null currentCgpa when a student has no records", async () => {
    stubSelect(db, [[{ id: 5, fullName: "Solo", identifier: "MAT/2023/0001", isActive: true, departmentName: "Law", levelValue: 100 }], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    const body = await res.json();
    expect(body.data[0].currentCgpa).toBeNull();
  });

  it("paginates the directory", async () => {
    stubSelect(db, [
      [
        { id: 1, fullName: "A. First", identifier: "MAT/001", isActive: true, departmentName: "D", levelValue: 100 },
        { id: 2, fullName: "B. Second", identifier: "MAT/002", isActive: true, departmentName: "D", levelValue: 100 },
        { id: 3, fullName: "C. Third", identifier: "MAT/003", isActive: true, departmentName: "D", levelValue: 100 },
      ],
      [],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    const body = await res.json();
    expect(body.data).toEqual([{ id: 2, fullName: "B. Second", identifier: "MAT/002", isActive: true, departmentName: "D", levelValue: 100, currentCgpa: null }]);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("skips the CGPA lookup when no students match", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x?search=nobody", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-numeric filter with 422 and field details", async () => {
    const res = await GET(jsonRequest("http://localhost/x?facultyId=abc", "GET"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details[0].field).toBe("facultyId");
  });

  it("rejects invalid pagination with 422", async () => {
    const res = await GET(jsonRequest("http://localhost/x?page=zero", "GET"));
    expect(res.status).toBe(422);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});
