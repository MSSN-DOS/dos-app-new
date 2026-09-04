import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const { requireAuthMock, getDbMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

import { GET } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDbMock.mockReturnValue(db);
  requireAuthMock.mockResolvedValue({ userId: 1, roleId: 1 });
});

describe("GET /api/jamb/subjects", () => {
  it("returns 200 with the subject list", async () => {
    const rows = [
      { id: 2, name: "Biology" },
      { id: 1, name: "Agricultural Science" },
    ];
    stubSelect(db, [rows]);

    const res = await GET(jsonRequest("http://localhost/api/jamb/subjects"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof rows };
    expect(body.data).toEqual(rows);
    expect(requireAuthMock).toHaveBeenCalledWith(expect.any(Request));
  });

  it("returns an empty list when there are no subjects", async () => {
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/api/jamb/subjects"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns 401 without a valid token", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/api/jamb/subjects"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the role is not allowed", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await GET(jsonRequest("http://localhost/api/jamb/subjects"));
    expect(res.status).toBe(403);
  });
});
