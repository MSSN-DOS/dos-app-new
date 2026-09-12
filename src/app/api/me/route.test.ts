import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getActiveSemester = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/semester", () => ({ getActiveSemester }));

import { GET } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  getActiveSemester.mockResolvedValue("rain");
});

describe("GET /api/me", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the student profile block with CGPA and quiz count", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubSelect(db, [
      [{ fullName: "Test Student", identifier: "21/30GN001", roleName: "student" }],
      [
        {
          departmentName: "Mathematics",
          facultyName: "Science",
          levelValue: 100,
        },
      ],
      [{ weekStart: "2026-08-22", cgpaValue: "87.50" }],
      [{ quizId: 3 }, { quizId: 4 }],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        id: 8,
        fullName: "Test Student",
        identifier: "21/30GN001",
        role: "student",
        activeSemester: "rain",
        profile: {
          faculty: "Science",
          department: "Mathematics",
          level: 100,
          cgpa: 4.38,
          cgpaWeekStart: "2026-08-22",
          quizzesTaken: 2,
        },
      },
    });
  });

  it("returns null CGPA fields when nothing has been released yet", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubSelect(db, [
      [{ fullName: "Test Student", identifier: "21/30GN001", roleName: "student" }],
      [
        {
          departmentName: "Mathematics",
          facultyName: "Science",
          levelValue: 100,
        },
      ],
      [],
      [],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profile.cgpa).toBeNull();
    expect(body.data.profile.cgpaWeekStart).toBeNull();
    expect(body.data.profile.quizzesTaken).toBe(0);
  });

  it("returns a null profile for a student without onboarding", async () => {
    requireAuth.mockResolvedValue({ userId: 8, roleId: 3 });
    stubSelect(db, [
      [{ fullName: "Test Student", identifier: "21/30GN001", roleName: "student" }],
      [],
      [],
      [],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profile).toEqual({
      faculty: null,
      department: null,
      level: null,
      cgpa: null,
      cgpaWeekStart: null,
      quizzesTaken: 0,
    });
  });

  it("returns the aspirant profile block with Post-UTME summary", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ fullName: "Test Aspirant", identifier: "12345678JA", roleName: "aspirant" }],
      [{ departmentName: "Medicine" }],
      [
        {
          weekStart: "2026-08-22",
          rawScore: "80.00",
          convertedScore50: "80.00",
        },
      ],
      [{ quizId: 5 }, { quizId: 6 }, { quizId: 7 }],
    ]);

    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        id: 9,
        fullName: "Test Aspirant",
        identifier: "12345678JA",
        role: "aspirant",
        activeSemester: "rain",
        profile: {
          aspirationDepartment: "Medicine",
          postUtmeRaw: 80,
          postUtmeConverted: 80,
          postUtmeWeekStart: "2026-08-22",
          quizzesTaken: 3,
        },
      },
    });
  });

  it("returns a null profile for admin/teacher roles", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 1 });
    stubSelect(db, [[{ fullName: "Admin", identifier: "ADM/2026/001", roleName: "admin" }]]);

    const res = await GET(jsonRequest("http://localhost/api/me", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("admin");
    expect(body.data.profile).toBeNull();
  });
});
