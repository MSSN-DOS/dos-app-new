import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  stubUpdate,
} from "@/lib/testing/route-test";

const { requireAuthMock, getDbMock, finalizeMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getDbMock: vi.fn(),
  finalizeMock: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: requireAuthMock,
}));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));
// The real finaliser is exercised by the attempt route's tests. Here we assert the *wiring* —
// which is what R-1 is about: that unpublish reaches the finaliser at all, and for every stranded
// attempt, before the status flips.
vi.mock("@/lib/quizzes/finalize-attempt", () => ({
  finalizeUnsubmittedAttempt: finalizeMock,
}));

let db: ReturnType<typeof makeDbMock>;

/** Let `db.transaction(cb)` run `cb` against the same mock, as the real driver would. */
function stubTransaction(): void {
  db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
  stubTransaction();
  finalizeMock.mockResolvedValue(true);
});

const URL_1 = "http://localhost/api/teacher/quizzes/1/unpublish";
const PARAMS = { params: Promise.resolve({ id: "1" }) };

const published = { id: 1, status: "published", createdBy: 5 };

describe("POST /api/teacher/quizzes/[id]/unpublish", () => {
  it("returns the quiz to draft when nothing has been released", async () => {
    stubSelect(db, [[published], [{ count: 0 }], []]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("draft");
  });

  // ── R-1: in-flight attempts keep counting (STATE.md:114, Board decision 2026-09-30) ──────────

  it("finalises every in-flight attempt so it stops being invisible to the retake guard", async () => {
    // Three students are mid-attempt when the quiz is pulled. An attempt with submittedAt IS NULL
    // is skipped by the "already attempted" check, so leaving them open hands each one a free
    // retake — and the client can no longer submit them because the status gate now 404s.
    stubSelect(db, [
      [published],
      [{ count: 0 }],
      [
        { id: 10, userId: 21 },
        { id: 11, userId: 22 },
        { id: 12, userId: 23 },
      ],
    ]);
    stubUpdate(db, { id: 1, status: "draft" });

    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);

    expect(finalizeMock).toHaveBeenCalledTimes(3);
    expect(finalizeMock.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [10, 1, 21],
      [11, 1, 22],
      [12, 1, 23],
    ]);
  });

  it("finalises attempts before the status flips, not after", async () => {
    // Ordering is the finding: the old route flipped first, which is what stranded them. If the
    // flip happened first and the finaliser then failed, the quiz would be a draft with attempts
    // that can never be reached again.
    const order: string[] = [];
    finalizeMock.mockImplementation(async () => {
      order.push("finalize");
      return true;
    });
    stubSelect(db, [[published], [{ count: 0 }], [{ id: 10, userId: 21 }]]);
    db.update.mockImplementation(() => {
      order.push("flip");
      const promise = Promise.resolve([{ id: 1, status: "draft" }]) as Promise<
        { id: number; status: string }[]
      > & { returning: () => Promise<{ id: number; status: string }[]> };
      promise.returning = () => Promise.resolve([{ id: 1, status: "draft" }]);
      return promise;
    });

    await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(order).toEqual(["finalize", "flip"]);
  });

  it("does both inside one transaction, so a partial failure cannot strand half of them", async () => {
    stubSelect(db, [[published], [{ count: 0 }], [{ id: 10, userId: 21 }]]);
    stubUpdate(db, { id: 1, status: "draft" });
    await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("reports how many attempts it finalised, so the teacher is not told nothing happened", async () => {
    stubSelect(db, [[published], [{ count: 0 }], [{ id: 10, userId: 21 }, { id: 11, userId: 22 }]]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    const body = (await res.json()) as { finalizedAttempts: number };
    expect(body.finalizedAttempts).toBe(2);
  });

  it("does not count an attempt a concurrent submit already finalised", async () => {
    // The finaliser's WHERE carries isNull(submittedAt), so a student POSTing their real answers at
    // the same moment wins. That attempt must not be reported as finalised here, or the teacher is
    // told we overwrote work that was actually kept.
    finalizeMock.mockResolvedValue(false);
    stubSelect(db, [[published], [{ count: 0 }], [{ id: 10, userId: 21 }]]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    const body = (await res.json()) as { finalizedAttempts: number };
    expect(body.finalizedAttempts).toBe(0);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
  });

  it("still unpublishes when there is nothing in flight", async () => {
    stubSelect(db, [[published], [{ count: 0 }], []]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("409s and names the released count once a score is out", async () => {
    stubSelect(db, [[published], [{ count: 4 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/4 released score/i);
    expect(body.error.message).toMatch(/permanently frozen/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("409s when the quiz is already a draft", async () => {
    stubSelect(db, [[{ id: 1, status: "draft", createdBy: 5 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/already a draft/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets an admin unpublish a quiz they do not own", async () => {
    requireAuthMock.mockResolvedValue({ userId: 1, roleId: 1, roleName: "admin" });
    stubSelect(db, [[{ id: 1, status: "published", createdBy: 5 }], [{ count: 0 }], []]);
    stubUpdate(db, { id: 1, status: "draft" });
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(200);
  });

  it("404s when the quiz does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/quiz not found/i);
  });

  it("403s when a teacher tries to unpublish someone else's quiz", async () => {
    stubSelect(db, [[{ id: 1, status: "published", createdBy: 99 }]]);
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/only unpublish quizzes you created/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(["abc", "0"])("400s on invalid quiz id %s", async (id) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid id");
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(jsonRequest(URL_1, "POST"), PARAMS);
    expect(res.status).toBe(403);
  });
});
