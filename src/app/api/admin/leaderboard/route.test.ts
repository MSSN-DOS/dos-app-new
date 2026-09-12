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

describe("GET /api/admin/leaderboard", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x?track=student", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x?track=student", "GET"));
    expect(res.status).toBe(403);
  });

  it("returns 422 when track is missing or invalid", async () => {
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 422 for a malformed week param", async () => {
    const res = await GET(
      jsonRequest("http://localhost/x?track=student&week=not-a-date", "GET"),
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("defaults to the most recent released week for students and ranks by CGPA desc", async () => {
    stubSelect(db, [
      [{ weekStart: "2026-08-22" }, { weekStart: "2026-08-15" }, { weekStart: "2026-08-15" }],
      [
        { userId: 8, fullName: "Bello, A.", score: "87.50" },
        { userId: 9, fullName: "Suleiman, K.", score: "80.00" },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/x?track=student", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { rank: 1, userId: 8, name: "Bello, A.", score: 4.38 },
        { rank: 2, userId: 9, name: "Suleiman, K.", score: 4 },
      ],
      weeks: ["2026-08-22", "2026-08-15"],
      week: "2026-08-22",
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("honors an explicit week param for students and dedupes the weeks list", async () => {
    stubSelect(db, [
      [{ weekStart: "2026-08-22" }, { weekStart: "2026-08-15" }],
      [{ userId: 9, fullName: "Suleiman, K.", score: "72.00" }],
    ]);

    const res = await GET(
      jsonRequest("http://localhost/x?track=student&week=2026-08-15", "GET"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ rank: 1, userId: 9, name: "Suleiman, K.", score: 3.6 }],
      weeks: ["2026-08-22", "2026-08-15"],
      week: "2026-08-15",
    });
  });

  it("ranks aspirants by converted Post-UTME score desc", async () => {
    stubSelect(db, [
      [{ weekStart: "2026-08-22" }, { weekStart: "2026-08-22" }],
      [
        { userId: 11, fullName: "Yusuf, F.", score: "94.00" },
        { userId: 12, fullName: "Okoro, C.", score: "90.00" },
      ],
    ]);

    const res = await GET(jsonRequest("http://localhost/x?track=aspirant", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { rank: 1, userId: 11, name: "Yusuf, F.", score: 94 },
        { rank: 2, userId: 12, name: "Okoro, C.", score: 90 },
      ],
      weeks: ["2026-08-22"],
      week: "2026-08-22",
    });
  });

  it("returns empty data when no released week exists yet", async () => {
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/x?track=aspirant", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [], weeks: [], week: null });
  });
});
