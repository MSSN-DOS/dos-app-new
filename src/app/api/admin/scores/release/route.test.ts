import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { POST } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubInsert,
  stubSelect,
  stubUpdate,
  type DbMock,
  type Row,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("POST /api/admin/scores/release", () => {
  it("releases one quiz's held attempts and reports the recompute", async () => {
    stubSelect(db, [
      // Held attempts for the quiz
      [
        { id: 1, userId: 7, weekStart: "2026-08-17" },
        { id: 2, userId: 8, weekStart: "2026-08-17" },
      ],
      // Released-attempt keys seen by the recompute
      [],
      // Best scores in the target week
      [],
    ]);
    stubUpdate(db, { id: 1 });
    stubInsert(db, []);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { quizId: 10 }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        releasedCount: 2,
        recomputed: [{ weekStart: "2026-08-17", cgpaUsers: 0, postUtmeUsers: 0 }],
      },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("releases a whole week and recomputes CGPA + Post-UTME per user", async () => {
    stubSelect(db, [
      // Held attempts across two quizzes in the week
      [
        { id: 1, userId: 7, weekStart: "2026-08-17" },
        { id: 2, userId: 7, weekStart: "2026-08-17" },
        { id: 3, userId: 9, weekStart: "2026-08-17" },
      ],
      // Released-attempt keys: user 7 released on both their quizzes, user 9 on one
      [
        { userId: 7, quizId: 10 },
        { userId: 7, quizId: 11 },
        { userId: 9, quizId: 10 },
      ],
      // Best scores in the week: course quiz + JAMB quiz for each user
      [
        { userId: 7, quizId: 10, bestScore: "80", courseId: 5, jambSubjectId: null },
        { userId: 7, quizId: 11, bestScore: "90", courseId: null, jambSubjectId: 3 },
        { userId: 9, quizId: 10, bestScore: "60", courseId: 5, jambSubjectId: null },
      ],
    ]);
    stubUpdate(db, { id: 1 });
    // First insert = cgpa_records upsert, second = post_utme_scores upsert
    // (nested arrays only because the upsert path ignores returned rows)
    const insertResults: Row[] = [[{}], [{}]] as unknown as Row[];
    stubInsert(db, insertResults);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { weekStart: "2026-08-17" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        releasedCount: 3,
        recomputed: [{ weekStart: "2026-08-17", cgpaUsers: 2, postUtmeUsers: 1 }],
      },
    });
  });

  it("excludes best scores whose quiz has no released attempt for that user", async () => {
    stubSelect(db, [
      [{ id: 1, userId: 7, weekStart: "2026-08-17" }],
      [{ userId: 7, quizId: 99 }], // released key points at another quiz
      [{ userId: 7, quizId: 10, bestScore: "80", courseId: 5, jambSubjectId: null }],
    ]);
    stubUpdate(db, { id: 1 });
    stubInsert(db, []);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { quizId: 10 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // No eligible best score → nothing written for either metric
    expect(body.data.recomputed[0]).toEqual({ weekStart: "2026-08-17", cgpaUsers: 0, postUtmeUsers: 0 });
  });

  it("returns 404 when there are no held attempts to release", async () => {
    stubSelect(db, [[]]);
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { quizId: 10 }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 422 for a body that is neither {quizId} nor {weekStart}", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", { quizId: "x" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(jsonRequest("http://localhost/x", "POST", { quizId: 10 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await POST(jsonRequest("http://localhost/x", "POST", { quizId: 10 }));
    expect(res.status).toBe(403);
  });
});
