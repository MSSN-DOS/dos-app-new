import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  type DbMock,
  type Row,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

/**
 * `stubSelect` discards the conditions it is handed, so it cannot tell us which predicates a route
 * actually built — which is the entire question these two tests ask. This installs a select mock
 * that captures the `where` argument so it can be rendered as real SQL and inspected.
 */
function captureWhereClause(db: DbMock, rows: Row[] = []): () => SQL {
  let captured: SQL | undefined;
  db.select.mockImplementation(() => {
    const ordered = async (): Promise<Row[]> => rows;
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: SQL) => {
        captured = condition;
        return { limit: async () => rows, orderBy: ordered };
      },
      orderBy: ordered,
    };
    return chain;
  });
  return () => {
    if (!captured) throw new Error("the route built no where clause");
    return captured;
  };
}

describe("GET /api/admin/scores/held", () => {
  it("returns 200 with held attempts grouped per quiz for an admin", async () => {
    stubSelect(db, [
      [
        {
          quizId: 10,
          title: "Week 1 Quiz",
          quizType: "course",
          weekStart: "2026-08-17",
          courseCode: "CHM101",
          subjectName: null,
        },
        {
          quizId: 10,
          title: "Week 1 Quiz",
          quizType: "course",
          weekStart: "2026-08-17",
          courseCode: "CHM101",
          subjectName: null,
        },
        {
          quizId: 12,
          title: "Physics JAMB",
          quizType: "course",
          weekStart: "2026-08-17",
          courseCode: null,
          subjectName: "Physics",
        },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          quizId: 10,
          label: "Week 1 Quiz",
          quizType: "course",
          weekStart: "2026-08-17",
          courseCode: "CHM101",
          subjectName: null,
          heldCount: 2,
        },
        {
          quizId: 12,
          label: "Physics JAMB",
          quizType: "course",
          weekStart: "2026-08-17",
          courseCode: null,
          subjectName: "Physics",
          heldCount: 1,
        },
      ],
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("returns Topic Quiz rows, which have no week", async () => {
    // Every submission is held until released, Topic Quiz submissions included. A Topic Quiz has
    // `weekStart = NULL` because it is not weekly, so if this list filters on a non-null week it
    // hides every held Topic Quiz score — leaving the Admin with no way to release any of them.
    stubSelect(db, [
      [
        {
          quizId: 21,
          title: "Photosynthesis basics",
          quizType: "topic",
          weekStart: null,
          courseCode: null,
          subjectName: null,
        },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          quizId: 21,
          label: "Photosynthesis basics",
          quizType: "topic",
          weekStart: null,
          courseCode: null,
          subjectName: null,
          heldCount: 1,
        },
      ],
    });
  });

  it("does not filter out weekless quizzes, but does filter by an explicit week", async () => {
    // The predicate itself is what matters here, not the rows: `stubSelect` cannot see conditions,
    // so the where clause is captured and rendered as SQL.
    const render = (condition: SQL): string => new PgDialect().sqlToQuery(condition).sql;

    const withoutWeek = captureWhereClause(db);
    await GET(jsonRequest("http://localhost/x", "GET"));
    const openSql = render(withoutWeek());
    expect(openSql).toMatch(/"submitted_at" is not null/);
    expect(openSql).toMatch(/"released_at" is null/);
    // The regression: this clause dropped every Topic Quiz row from the list.
    expect(openSql).not.toMatch(/"week_start" is not null/);

    db = makeDbMock();
    getDb.mockReturnValue(db);
    const withWeek = captureWhereClause(db);
    await GET(jsonRequest("http://localhost/x?week=2026-08-17", "GET"));
    const weekSql = render(withWeek());
    // An explicit week is an equality, which SQL never satisfies for NULL — so asking for a week
    // correctly excludes the weekless quizzes without needing a second clause to do it.
    expect(weekSql).toMatch(/"week_start" = \$/);
    expect(weekSql).not.toMatch(/"week_start" is not null/);
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
