import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ getDb }));

import { GET } from "./route";
import { makeDbMock, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

describe("GET /api/health", () => {
  it("returns 200 and pings the database when it is reachable", async () => {
    db.execute.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      db: "ok",
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    // The query is the entire point: a health route that never touches the DB would not
    // reset Supabase's inactivity timer.
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("is callable without any credentials and never caches the result", async () => {
    db.execute.mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when the database rejects the probe", async () => {
    db.execute.mockRejectedValue(new Error('password authentication failed for user "postgres"'));

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      status: "degraded",
      db: "unreachable",
      timestamp: expect.any(String),
    });
  });

  it("does not leak the underlying database error", async () => {
    db.execute.mockRejectedValue(new Error('password authentication failed for user "postgres"'));

    const body = JSON.stringify(await (await GET()).json());

    expect(body).not.toContain("password");
    expect(body).not.toContain("postgres");
    expect(body).not.toContain("authentication");
  });

  it("returns 503 when the database client cannot be constructed", async () => {
    // getDb() throws synchronously when DATABASE_URL is unset — a real deployment failure
    // that must read as "degraded", not as a 500 stack trace.
    getDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });

    const res = await GET();

    expect(res.status).toBe(503);
    expect((await res.json()).db).toBe("unreachable");
  });
});
