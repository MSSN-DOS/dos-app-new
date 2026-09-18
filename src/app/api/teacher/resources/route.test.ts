import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const requireAuth = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb }));

import { GET, POST } from "./route";
import { jsonRequest, makeDbMock, stubInsert, stubSelect, type DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDbMock();
  getDb.mockReturnValue(db);
});

const TEACHER = { userId: 5, roleId: 2, roleName: "teacher" };
const ADMIN = { userId: 1, roleId: 1, roleName: "admin" };

const DRIVE_URL = "https://drive.google.com/file/d/ABCFILE123/view?usp=sharing";

function videoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    title: "Limits and Continuity",
    url: DRIVE_URL,
    courseId: 3,
    jambSubjectId: null,
    createdAt: new Date("2026-09-17T09:00:00Z"),
    uploadedBy: 5,
    courseCode: "MAT 101",
    subjectName: null,
    ...overrides,
  };
}

describe("GET /api/teacher/resources", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(403);
  });

  it("returns the teacher's own links with a normalised watch/embed pair", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[videoRow()]]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 11,
      title: "Limits and Continuity",
      provider: "google_drive",
      watchUrl: "https://drive.google.com/file/d/ABCFILE123/view",
      embedUrl: "https://drive.google.com/file/d/ABCFILE123/preview",
      courseCode: "MAT 101",
    });
    // The raw URL the teacher pasted is preserved alongside the derived pair.
    expect(body.data[0].url).toBe(DRIVE_URL);
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ["admin", "teacher"]);
  });

  it("degrades safely when a stored URL no longer parses", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[videoRow({ url: "not a url" })]]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    const body = await res.json();
    expect(body.data[0]).toMatchObject({
      provider: "other",
      embedUrl: null,
      watchUrl: "not a url",
    });
  });

  it("returns an empty list rather than erroring when the teacher has no links", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[]]);

    const res = await GET(jsonRequest("http://localhost/x", "GET"));
    await expect(res.json()).resolves.toEqual({ data: [] });
  });
});

describe("POST /api/teacher/resources", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(jsonRequest("http://localhost/x", "POST", {}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requireAuth.mockRejectedValueOnce(new ForbiddenError());
    const res = await POST(jsonRequest("http://localhost/x", "POST", {}));
    expect(res.status).toBe(403);
  });

  it("creates a video link and stores the pasted URL verbatim", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[{ id: 3 }]]);
    // A local spy rather than `stubInsert`: the shared stub's `values` is a plain function,
    // so it can't be asserted on.
    const values = vi.fn(() => ({ returning: async () => [videoRow()] }));
    db.insert.mockImplementation(() => ({ values }));

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Limits and Continuity",
        url: DRIVE_URL,
        courseId: 3,
      }),
    );

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith({
      type: "video",
      title: "Limits and Continuity",
      bodyOrFileUrl: DRIVE_URL,
      courseId: 3,
      jambSubjectId: null,
      uploadedBy: 5,
    });
  });

  it("rejects a javascript: URL with 422 and per-field details", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Lecture",
        url: "javascript:alert(1)",
        courseId: 3,
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([
      expect.objectContaining({ field: "url" }),
    ]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a body scoped to both a course and a JAMB subject", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Lecture",
        url: DRIVE_URL,
        courseId: 3,
        jambSubjectId: 4,
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a type other than video — pdf and article stay admin-only", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "article",
        title: "Sneaky article",
        url: DRIVE_URL,
        courseId: 3,
      }),
    );

    expect(res.status).toBe(422);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when the scoped course does not exist", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[]]);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Lecture",
        url: DRIVE_URL,
        courseId: 999,
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "Course not found" },
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when the scoped JAMB subject does not exist", async () => {
    requireAuth.mockResolvedValueOnce(TEACHER);
    stubSelect(db, [[]]);

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Lecture",
        url: DRIVE_URL,
        jambSubjectId: 999,
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "JAMB subject not found" },
    });
  });

  it("lets an admin submit too", async () => {
    requireAuth.mockResolvedValueOnce(ADMIN);
    stubSelect(db, [[{ id: 4 }]]);
    stubInsert(db, videoRow({ id: 12, uploadedBy: 1 }));

    const res = await POST(
      jsonRequest("http://localhost/x", "POST", {
        type: "video",
        title: "Board briefing",
        url: "https://youtu.be/dQw4w9WgXcQ",
        jambSubjectId: 4,
      }),
    );

    expect(res.status).toBe(201);
  });
});
