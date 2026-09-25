import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { INITIAL_PASSWORD_ALPHABET } from "@/lib/teachers/password";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const hashPassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/auth/password", () => ({ hashPassword }));

import { GET, POST } from "./route";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
  stubTransaction,
  type DbMock,
} from "@/lib/testing/route-test";

let db: DbMock;

const TEACHER_ROLE = { id: 3, name: "teacher" };

/** A tx that returns a created Teacher on its first insert, then records assignment rows. */
function assignmentTx(teacher: Record<string, unknown>) {
  const tx = makeDbMock();
  const assignmentValues: {
    userId: number;
    courseId: number | null;
    jambSubjectId: number | null;
  }[] = [];
  let userInserted = false;
  tx.insert.mockImplementation(() => ({
    values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
      if (!userInserted) {
        userInserted = true;
        // Mirror the route's .returning() projection — the API response must never carry
        // the hash / roleId / identifierType the insert value actually contains.
        const inserted = v as Record<string, unknown>;
        return {
          returning: async () => [
            {
              id: teacher.id,
              fullName: inserted.fullName,
              identifier: inserted.identifier,
              isActive: teacher.isActive,
            },
          ],
        };
      }
      const rows = Array.isArray(v) ? v : [v];
      assignmentValues.push(
        ...(rows as { userId: number; courseId: number | null; jambSubjectId: number | null }[]),
      );
      return { returning: async () => rows.map((r, i) => ({ id: 100 + i, ...r })) };
    },
  }));
  return { tx, assignmentValues };
}

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
  hashPassword.mockResolvedValue("$2a$12$hashed");
});

describe("GET /api/admin/teachers", () => {
  it("returns 200 with the teacher list, quiz counts and assigned subjects", async () => {
    stubSelect(db, [
      [
        { id: 1, fullName: "Ibrahim, S.", identifier: "STF-014", isActive: true },
        { id: 2, fullName: "Adebayo, K.", identifier: "STF-002", isActive: false },
      ],
      [{ createdBy: 1 }, { createdBy: 1 }, { createdBy: 2 }],
      [
        { userId: 1, courseCode: "MAT 101", jambSubjectName: null },
        { userId: 1, courseCode: null, jambSubjectName: "Chemistry" },
        { userId: 2, courseCode: "PHY 201", jambSubjectName: null },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 1,
          fullName: "Ibrahim, S.",
          identifier: "STF-014",
          isActive: true,
          publishedQuizzes: 2,
          subjects: ["MAT 101", "Chemistry"],
        },
        {
          id: 2,
          fullName: "Adebayo, K.",
          identifier: "STF-002",
          isActive: false,
          publishedQuizzes: 1,
          subjects: ["PHY 201"],
        },
      ],
      meta: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
    });
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("slices teachers after counting published quizzes and returns pagination metadata", async () => {
    stubSelect(db, [
      [
        { id: 1, fullName: "A. First", identifier: "STF-001", isActive: true },
        { id: 2, fullName: "B. Second", identifier: "STF-002", isActive: true },
        { id: 3, fullName: "C. Third", identifier: "STF-003", isActive: true },
      ],
      [{ createdBy: 2 }, { createdBy: 2 }, { createdBy: 3 }],
      [],
    ]);
    const res = await GET(jsonRequest("http://localhost/x?page=2&pageSize=1", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        id: 2,
        fullName: "B. Second",
        identifier: "STF-002",
        isActive: true,
        publishedQuizzes: 2,
        subjects: [],
      },
    ]);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("returns zero counts when nothing is published", async () => {
    stubSelect(db, [
      [{ id: 1, fullName: "Solo", identifier: "STF-001", isActive: true }],
      [],
      [],
    ]);
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].publishedQuizzes).toBe(0);
    expect(body.data[0].subjects).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/teachers", () => {
  const validBody = { fullName: "Ibrahim, S.", courseIds: [2] };

  it("creates a teacher and returns 201 with the generated ID, one-time password and subject rows", async () => {
    stubSelect(db, [[{ id: 2, code: "MAT 101", title: "Algebra" }], [TEACHER_ROLE], []]);
    const { tx, assignmentValues } = assignmentTx({
      id: 10,
      fullName: "Ibrahim, S.",
      identifier: "STF-001",
      isActive: true,
    });
    stubTransaction(db, tx);

    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();

    // First generated teacher gets STF-001; the password is 12 chars over the export alphabet.
    expect(body.teacher).toEqual({
      id: 10,
      fullName: "Ibrahim, S.",
      identifier: "STF-001",
      isActive: true,
    });
    expect(typeof body.initialPassword).toBe("string");
    expect(body.initialPassword).toHaveLength(12);
    for (const ch of body.initialPassword) {
      expect(INITIAL_PASSWORD_ALPHABET).toContain(ch);
    }

    // The generated course rows come back so the one-time modal can list them.
    expect(body.courses).toEqual([{ id: 2, code: "MAT 101", title: "Algebra" }]);
    expect(body.jambSubjects).toEqual([]);

    // The plaintext password was hashed for storage and never echoed in full.
    expect(hashPassword).toHaveBeenCalledWith(body.initialPassword);
    expect(JSON.stringify(body)).not.toContain("$2a$12$hashed");
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    // The assignment row was written inside the transaction.
    expect(assignmentValues).toEqual([{ userId: 10, courseId: 2, jambSubjectId: null }]);
  });

  it("assigns JAMB subjects and returns them for the one-time modal", async () => {
    stubSelect(db, [[{ id: 4, name: "Biology" }], [TEACHER_ROLE], []]);
    const { tx, assignmentValues } = assignmentTx({
      id: 11,
      fullName: "X",
      identifier: "STF-001",
      isActive: true,
    });
    stubTransaction(db, tx);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { fullName: "X", jambSubjectIds: [4] }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.jambSubjects).toEqual([{ id: 4, name: "Biology" }]);
    expect(assignmentValues).toEqual([{ userId: 11, courseId: null, jambSubjectId: 4 }]);
  });

  it("increments the staff ID past existing identifiers", async () => {
    stubSelect(db, [
      [{ id: 2, code: "MAT 101", title: "Algebra" }],
      [TEACHER_ROLE],
      [{ identifier: "STF-001" }, { identifier: "STF-003" }],
    ]);
    const { tx } = assignmentTx({ id: 10, fullName: "X", identifier: "STF-004", isActive: true });
    stubTransaction(db, tx);

    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.teacher.identifier).toBe("STF-004");
  });

  it("retries with the next sequential number when a concurrent insert collides", async () => {
    stubSelect(db, [
      [{ id: 2, code: "MAT 101", title: "Algebra" }],
      [TEACHER_ROLE],
      [{ identifier: "STF-001" }],
    ]);
    const identifiers: string[] = [];
    let insertCalls = 0;
    db.transaction.mockImplementation(
      async (cb: (tx: DbMock) => Promise<unknown>): Promise<unknown> => {
        // First attempt: the insert throws the unique-violation the retry loop lives for.
        if (insertCalls === 0) {
          insertCalls += 1;
          const failingTx = makeDbMock();
          failingTx.insert.mockImplementation(() => ({
            values: (v: Record<string, unknown>) => {
              // Record the identifier the first transaction tried before it collided.
              identifiers.push(v.identifier as string);
              throw Object.assign(new Error("dup"), { code: "23505" });
            },
          }));
          await cb(failingTx);
          return;
        }
        // Second attempt: the tx actually succeeds, in the same call order as the route.
        const okTx = makeDbMock();
        let userInserted = false;
        okTx.insert.mockImplementation(() => ({
          values: (v: Record<string, unknown>) => {
            if (!userInserted) {
              userInserted = true;
              identifiers.push(v.identifier as string);
              return { returning: async () => [{ id: 10, ...v, isActive: true }] };
            }
            return { returning: async () => [{ id: 1, ...v }] };
          },
        }));
        return cb(okTx);
      },
    );

    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.teacher.identifier).toBe("STF-003");
    expect(identifiers).toEqual(["STF-002", "STF-003"]);
  });

  it("returns 404 when a course does not exist", async () => {
    stubSelect(db, [[]]);
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", { fullName: "Ibrahim, S.", courseIds: [999] }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/course/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when a JAMB subject does not exist", async () => {
    stubSelect(db, [[{ id: 2, code: "MAT 101", title: "Algebra" }], []]);
    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        fullName: "Ibrahim, S.",
        courseIds: [2],
        jambSubjectIds: [999],
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/JAMB subject/i);
  });

  it("returns 422 when the teacher role row does not exist", async () => {
    stubSelect(db, [[{ id: 2, code: "MAT 101", title: "Algebra" }], []]);
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(422);
  });

  it.each([
    ["no subject assigned", { fullName: "X" }],
    ["both subject arrays empty", { fullName: "X", courseIds: [], jambSubjectIds: [] }],
    ["missing full name", { courseIds: [2] }],
    ["empty full name", { fullName: "", courseIds: [2] }],
    ["whitespace full name", { fullName: "   ", courseIds: [2] }],
    ["full name over 150 chars", { fullName: "N".repeat(151), courseIds: [2] }],
    ["course id below 1", { fullName: "X", courseIds: [0] }],
    ["non-numeric course id", { fullName: "X", courseIds: ["abc"] }],
  ])("returns 422 with details for %s", async (_label, body) => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", body));
    expect(res.status).toBe(422);
    const parsed = await res.json();
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError("Missing token"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError("Admin role required"));
    const res = await POST(jsonRequest("http://localhost/x", "POST", validBody));
    expect(res.status).toBe(403);
  });
});