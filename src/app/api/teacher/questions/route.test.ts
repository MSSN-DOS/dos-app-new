import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
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
  getDb.mockReturnValue(db);
  requireAuth.mockResolvedValue({ userId: 5, roleId: 2 });
});

const courseTrack = { courseId: 2 };

describe("GET /api/teacher/questions", () => {
  it("returns 200 with the question list", async () => {
    stubSelect(db, [
      [
        { id: 1, questionType: "options", status: "published", courseId: 2 },
        { id: 2, questionType: "fill_in_gap", status: "draft", jambSubjectId: 3 },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, questionType: "options", status: "published", courseId: 2 },
        { id: 2, questionType: "fill_in_gap", status: "draft", jambSubjectId: 3 },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });

  it("slices the requested page and returns pagination metadata", async () => {
    stubSelect(db, [[
      { id: 1, questionType: "options", status: "published", courseId: 2 },
      { id: 2, questionType: "fill_in_gap", status: "draft", jambSubjectId: 3 },
      { id: 3, questionType: "options", status: "draft", courseId: 2 },
    ]]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 2, questionType: "fill_in_gap", status: "draft", jambSubjectId: 3 }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
  });

  it("returns an empty list when no questions exist", async () => {
    stubSelect(db, [[]]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [],
      meta: { page: 1, pageSize: 0, total: 0, totalPages: 1 },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });

  it("accepts a search term without erroring", async () => {
    stubSelect(db, [[{ id: 1, questionType: "options", status: "published", courseId: 2 }]]);
    const res = await GET(jsonRequest("http://localhost/x?search=2+%2B+2", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [{ id: 1, questionType: "options", status: "published", courseId: 2 }],
      meta: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    });
  });

  it("hides attached questions when unattachedOnly=1 (teacher scope)", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
    stubSelect(db, [[{ id: 2, questionType: "fill_in_gap", status: "draft", courseId: 2 }]]);
    const res = await GET(jsonRequest("http://localhost/x?unattachedOnly=1", "GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number }[] };
    expect(body.data).toEqual([{ id: 2, questionType: "fill_in_gap", status: "draft", courseId: 2 }]);
  });

  it("accepts unattachedOnly=1 for an admin caller (no ownership scope)", async () => {
    stubSelect(db, [[{ id: 1, questionType: "options", status: "published", courseId: 2 }]]);
    const res = await GET(jsonRequest("http://localhost/x?unattachedOnly=1", "GET"));
    expect(res.status).toBe(200);
  });

  it("combines unattachedOnly with an excludeQuizId filter", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
    stubSelect(db, [[]]);
    const res = await GET(
      jsonRequest("http://localhost/x?unattachedOnly=1&excludeQuizId=3", "GET"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [],
      meta: { page: 1, pageSize: 0, total: 0, totalPages: 1 },
    });
  });
});

describe("POST /api/teacher/questions — draft (lenient)", () => {
  it("saves an empty-body draft with no options or blanks", async () => {
    const inserted: Record<string, unknown> = {};
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(inserted, v);
        return { returning: async () => [{ id: 10, ...v }] };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("draft");
    expect(inserted.createdBy).toBe(5);
    expect(body.options).toEqual([]);
    expect(body.blanks).toEqual([]);
  });

  it("stores blanks for a fill-in-gap draft and trims answers", async () => {
    const blankValues: Record<string, unknown>[] = [];
    db.insert.mockImplementation((table: unknown) => {
      void table;
      return {
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(v) ? v : [v];
          if (rows.length > 0 && "acceptedAnswer" in rows[0]) {
            blankValues.push(...rows);
            return {
              returning: async () => rows.map((r, i) => ({ id: 100 + i, ...r })),
            };
          }
          return { returning: async () => [{ id: 11, ...rows[0] }] };
        },
      };
    });
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "fill_in_gap",
        bodyRichText: "2 + 2 = ____.",
        blanks: [{ acceptedAnswer: "  four " }, { acceptedAnswer: "4" }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.blanks).toHaveLength(2);
    expect(blankValues[0].acceptedAnswer).toBe("four");
    expect(blankValues.map((b) => b.blankIndex)).toEqual([1, 2]);
  });

  it("rejects a question on both tracks with 422 even as a draft", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        courseId: 2,
        jambSubjectId: 3,
        questionType: "options",
        bodyRichText: "",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "jambSubjectId" }),
      ]),
    );
  });

  it("rejects a question on neither track with 422", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        questionType: "fill_in_gap",
        bodyRichText: "",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "courseId" })]),
    );
  });

  it("rejects an unknown status value with 422", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "",
        status: "archived",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details[0].field).toBe("status");
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/teacher/questions — publish (strict)", () => {
  const publishedOptionsBody = {
    ...courseTrack,
    questionType: "options",
    bodyRichText: "Salah is performed how many times daily?",
    status: "published",
    options: [
      { optionText: "Five", isCorrect: true },
      { optionText: "Three", isCorrect: false },
    ],
  };

  it("publishes a valid options question and stores sorted options", async () => {
    const optionValues: Record<string, unknown>[] = [];
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(v) ? v : [v];
        if (rows.length > 0 && "isCorrect" in rows[0]) {
          optionValues.push(...rows);
          return {
            returning: async () => rows.map((r, i) => ({ id: 50 + i, ...r })),
          };
        }
        return { returning: async () => [{ id: 12, ...rows[0] }] };
      },
    }));
    const res = await POST(jsonRequest("http://localhost/x", "POST", publishedOptionsBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("published");
    expect(optionValues.map((o) => o.sortOrder)).toEqual([0, 1]);
    expect(body.options).toHaveLength(2);
  });

  it("blocks publishing a question with no text", async () => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "   ",
        status: "published",
        options: [
          { optionText: "A", isCorrect: true },
          { optionText: "B", isCorrect: false },
        ],
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "bodyRichText", message: expect.stringMatching(/required/i) }),
      ]),
    );
  });

  it.each([
    {
      name: "fewer than two options",
      overrides: { options: [{ optionText: "Only one", isCorrect: true }] },
      message: /at least two options/i,
    },
    {
      name: "no correct option",
      overrides: {
        options: [
          { optionText: "A", isCorrect: false },
          { optionText: "B", isCorrect: false },
        ],
      },
      message: /correct before publishing|one option must be marked correct/i,
    },
    {
      name: "two correct options",
      overrides: {
        options: [
          { optionText: "A", isCorrect: true },
          { optionText: "B", isCorrect: true },
        ],
      },
      message: /only one option may be marked correct/i,
    },
    {
      name: "an empty option text",
      overrides: {
        options: [
          { optionText: "", isCorrect: true },
          { optionText: "B", isCorrect: false },
        ],
      },
      message: /every option needs text/i,
    },
  ])("blocks publishing an options question with $name", async ({ overrides, message }) => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "options",
        bodyRichText: "Body text here",
        status: "published",
        ...overrides,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "options", message: expect.stringMatching(message) }),
      ]),
    );
  });

  it.each([
    {
      name: "no blanks",
      overrides: { blanks: [] },
      message: /at least one blank/i,
    },
    {
      name: "a blank without an accepted answer",
      overrides: { blanks: [{ acceptedAnswer: "x" }, { acceptedAnswer: "   " }] },
      message: /every blank needs an accepted answer/i,
    },
  ])("blocks publishing a fill-in-gap question with $name", async ({ overrides, message }) => {
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "fill_in_gap",
        bodyRichText: "2 + 2 = ____.",
        status: "published",
        ...overrides,
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "blanks", message: expect.stringMatching(message) }),
      ]),
    );
  });

  it("publishes a valid fill-in-gap question", async () => {
    db.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(v) ? v : [v];
        return { returning: async () => rows.map((r, i) => ({ id: 60 + i, ...r })) };
      },
    }));
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        ...courseTrack,
        questionType: "fill_in_gap",
        bodyRichText: "2 + 2 = ____.",
        status: "published",
        blanks: [{ acceptedAnswer: "4" }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("published");
    expect(body.blanks).toHaveLength(1);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", publishedOptionsBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin or teacher", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Role not allowed"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", publishedOptionsBody));
    expect(res.status).toBe(403);
  });
});
