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

describe("GET /api/admin/scores/held", () => {
  it("returns 200 with held attempts grouped per quiz for an admin", async () => {
    stubSelect(db, [
      [
        { quizId: 10, title: "Week 1 Quiz", weekStart: "2026-08-17", courseCode: "CHM101", subjectName: null },
        { quizId: 10, title: "Week 1 Quiz", weekStart: "2026-08-17", courseCode: "CHM101", subjectName: null },
        { quizId: 12, title: "Physics JAMB", weekStart: "2026-08-17", courseCode: null, subjectName: "Physics" },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          quizId: 10,
          label: "Week 1 Quiz",
          weekStart: "2026-08-17",
          courseCode: "CHM101",
          subjectName: null,
          heldCount: 2,
        },
        {
          quizId: 12,
          label: "Physics JAMB",
          weekStart: "2026-08-17",
          courseCode: null,
          subjectName: "Physics",
          heldCount: 1,
        },
      ],
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns an empty list when nothing is held", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  it("returns 422 with details for a malformed week param", async () => {
    const res = await GET(jsonRequest("http://localhost/x?week=not-a-date", "GET"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});
