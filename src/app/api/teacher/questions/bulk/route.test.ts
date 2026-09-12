import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

import { POST } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubTransaction,
} from "@/lib/testing/route-test";

const { requireAuthMock, getDbMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

let db: ReturnType<typeof makeDbMock>;
let tx: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 5, roleId: 2, roleName: "teacher" });
  db = makeDbMock();
  tx = makeDbMock();
  stubTransaction(db, tx);
  getDbMock.mockReturnValue(db);
});

const URL = "http://localhost/api/teacher/questions/bulk";
const draftItem = (over: Record<string, unknown> = {}) => ({
  courseId: 2,
  questionType: "options",
  bodyRichText: "Draft body",
  ...over,
});
const publishedItem = (over: Record<string, unknown> = {}) => ({
  courseId: 2,
  questionType: "options",
  bodyRichText: "Published body",
  status: "published",
  options: [
    { optionText: "A", isCorrect: true },
    { optionText: "B", isCorrect: false },
  ],
  ...over,
});

describe("POST /api/teacher/questions/bulk", () => {
  it("creates several questions inside one transaction and returns 201", async () => {
    const seq: { table: string; rows: Record<string, unknown>[] }[] = [];
    const makeInsert = () => (table: unknown) => {
      const name = getTableName(table as never);
      return {
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(v) ? v : [v];
          seq.push({ table: name, rows });
          return {
            returning: async () =>
              rows.map((r, i) => ({ id: 100 + seq.length * 10 + i, ...r })),
          };
        },
      };
    };
    tx.insert.mockImplementation(makeInsert());

    const res = await POST(
      jsonRequest(URL, "POST", {
        questions: [draftItem(), publishedItem()],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].status).toBe("draft");
    expect(body.data[1].status).toBe("published");
    expect(body.data[1].options).toHaveLength(2);
    expect(seq.filter((s) => s.table === "questions")).toHaveLength(2);
    // The insert happened on the transaction, not the bare db connection.
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps blank answers and options in row order for fill-in-gap items", async () => {
    const blankRows: Record<string, unknown>[] = [];
    tx.insert.mockImplementation(
      (table: unknown) => {
        const name = getTableName(table as never);
        return {
          values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
            const rows = Array.isArray(v) ? v : [v];
            if (name === "question_blanks") {
              blankRows.push(...rows);
              return { returning: async () => rows.map((r, i) => ({ id: 50 + i, ...r })) };
            }
            return { returning: async () => rows.map((r, i) => ({ id: 10 + i, ...r })) };
          },
        };
      },
    );
    const res = await POST(
      jsonRequest(URL, "POST", {
        questions: [
          {
            courseId: 2,
            questionType: "fill_in_gap",
            bodyRichText: "2 + 2 = ____.",
            blanks: [{ acceptedAnswer: " four " }, { acceptedAnswer: "4" }],
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(blankRows.map((b) => b.blankIndex)).toEqual([1, 2]);
    expect(blankRows[0].acceptedAnswer).toBe("four");
  });

  it("422s the whole batch and writes nothing when one row fails strict publish rules", async () => {
    const res = await POST(
      jsonRequest(URL, "POST", {
        questions: [
          draftItem(), // valid draft — fine on its own
          publishedItem({ options: [{ optionText: "A", isCorrect: false }] }), // <2 options
        ],
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: { field: string }[] };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.some((d) => d.field === "questions.1.options")).toBe(true);
    // All-or-nothing: no question insert ever ran.
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("422s naming the exact row for a both-tracks violation in a later item", async () => {
    const res = await POST(
      jsonRequest(URL, "POST", {
        questions: [
          draftItem(),
          draftItem({ jambSubjectId: 3 }),
        ],
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { details: { field: string }[] };
    };
    expect(
      body.error.details.some((d) => d.field === "questions.1.jambSubjectId"),
    ).toBe(true);
  });

  it("422s on an unknown per-item status with a row-prefixed field", async () => {
    const res = await POST(
      jsonRequest(URL, "POST", {
        questions: [draftItem({ status: "archived" })],
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details[0].field).toBe("questions.0.status");
  });

  it.each([
    {},
    { questions: [] },
    { questions: Array.from({ length: 51 }, () => draftItem()) },
    { questions: "nope" },
  ])("422s on invalid batch shape %j", async (payload) => {
    const res = await POST(jsonRequest(URL, "POST", payload));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("401s without auth", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(jsonRequest(URL, "POST", { questions: [draftItem()] }));
    expect(res.status).toBe(401);
  });

  it("403s for non-teacher roles", async () => {
    requireAuthMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(jsonRequest(URL, "POST", { questions: [draftItem()] }));
    expect(res.status).toBe(403);
  });
});
