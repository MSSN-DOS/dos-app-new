import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import { jsonRequest, makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/admin/users/students/[id]", () => {
  const studentRow = [
    { id: 7, fullName: "Bello, A.", identifier: "MAT/2023/0142", isActive: true, departmentName: "Chemical Eng", facultyName: "Engineering", levelValue: 300 },
  ];

  it("returns profile, CGPA history and attempt history for an admin", async () => {
    stubSelect(db, [
      studentRow,
      [
        { weekStart: "2026-08-24", cgpaValue: "4.10" },
        { weekStart: "2026-08-17", cgpaValue: "3.80" },
      ],
      [
        { attemptId: 1, quizId: 11, quizTitle: "Week 1 Quiz", quizType: "course", courseCode: "CHE 301", attemptNumber: 1, score: "80.00", submittedAt: "2026-08-18T10:00:00Z", releasedAt: "2026-08-20T09:00:00Z" },
        { attemptId: 2, quizId: 12, quizTitle: "Week 2 Quiz", quizType: "topic", courseCode: null, attemptNumber: 1, score: "90.00", submittedAt: "2026-08-25T12:00:00Z", releasedAt: null },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.student).toEqual(studentRow[0]);
    expect(body.currentCgpa).toBe("4.10");
    expect(body.quizzesTaken).toBe(2);
    expect(body.cgpaHistory).toHaveLength(2);
    // Held attempts are visible to Admin with released status explicit.
    expect(body.attempts[1].releasedAt).toBeNull();
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns nulls when the student has no history yet", async () => {
    stubSelect(db, [studentRow, [], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    const body = await res.json();
    expect(body.currentCgpa).toBeNull();
    expect(body.attempts).toEqual([]);
    expect(body.cgpaHistory).toEqual([]);
  });

  it("returns 404 for an unknown or non-student id", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a malformed id", async () => {
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("7"));
    expect(res.status).toBe(403);
  });
});
