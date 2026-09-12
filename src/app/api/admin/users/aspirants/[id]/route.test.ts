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

describe("GET /api/admin/users/aspirants/[id]", () => {
  const aspirantRow = [
    { id: 3, fullName: "Yusuf, F.", identifier: "12345678AB", isActive: true, aspirationDepartment: "Medicine & Surgery" },
  ];

  it("returns profile, Post-UTME history and attempt history for an admin", async () => {
    stubSelect(db, [
      aspirantRow,
      [
        { weekStart: "2026-08-24", rawScore: "38.00", convertedScore50: "76.00" },
        { weekStart: "2026-08-17", rawScore: "36.00", convertedScore50: "72.00" },
      ],
      [
        { attemptId: 9, quizId: 21, quizTitle: "Post-UTME Week 1", quizType: "course", courseCode: null, subjectName: "English", attemptNumber: 1, score: "38.00", submittedAt: "2026-08-18T10:00:00Z", releasedAt: null },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aspirant).toEqual(aspirantRow[0]);
    expect(body.latestPostUtme).toBe("76.00");
    expect(body.postUtmeHistory).toHaveLength(2);
    expect(body.attempts[0].subjectName).toBe("English");
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns nulls when the aspirant has no history yet", async () => {
    stubSelect(db, [aspirantRow, [], []]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("3"));
    const body = await res.json();
    expect(body.latestPostUtme).toBeNull();
    expect(body.attempts).toEqual([]);
    expect(body.postUtmeHistory).toEqual([]);
  });

  it("returns 404 for an unknown or non-aspirant id", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("99"));
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
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("3"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"), ctx("3"));
    expect(res.status).toBe(403);
  });
});
