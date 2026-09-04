// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth, createResourceSignedUrl } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createResourceSignedUrl: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/storage/supabase-storage", () => ({ createResourceSignedUrl }));

import { GET } from "./route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubSelect,
} from "@/lib/testing/route-test";
import type { DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  createResourceSignedUrl.mockResolvedValue("https://signed.example/pdf");
  db = makeDbMock();
});

function url(query = ""): string {
  return `http://localhost/api/resources${query}`;
}

describe("GET /api/resources — auth", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await GET(jsonRequest(url()));
    expect(res.status).toBe(401);
  });

  it("returns 403 for admin/teacher roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await GET(jsonRequest(url()));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/resources — aspirant branch", () => {
  it("lists JAMB-scoped content and signs PDF urls", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [
      [{ name: "aspirant" }],
      [
        {
          id: 1,
          type: "pdf",
          title: "Formula Sheet",
          bodyOrFileUrl: "resources/jamb/physics/sheet.pdf",
          subjectName: "Physics",
        },
        {
          id: 2,
          type: "article",
          title: "Common Grammar Mistakes",
          bodyOrFileUrl: "Some article text",
          subjectName: "Use of English",
        },
      ],
    ]);

    const res = await GET(jsonRequest(url()));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const rows = (body as { data: Array<Record<string, unknown>> }).data;
    expect(rows).toHaveLength(2);
    expect(rows[0].fileUrl).toBe("https://signed.example/pdf");
    expect(rows[0].bodyOrFileUrl).toBeUndefined();
    // Articles never hit Storage.
    expect(createResourceSignedUrl).toHaveBeenCalledTimes(1);
    expect(rows[1].fileUrl).toBeUndefined();
  });

  it("passes the jambSubjectId filter through", async () => {
    requireAuth.mockResolvedValue({ userId: 9, roleId: 4 });
    stubSelect(db, [[{ name: "aspirant" }], []]);

    const res = await GET(jsonRequest(url("?jambSubjectId=3")));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect((body as { data: unknown[] }).data).toHaveLength(0);
  });
});

describe("GET /api/resources — student branch", () => {
  it("returns 404 when the student has no profile yet", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [[{ name: "student" }], []]);

    const res = await GET(jsonRequest(url()));
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expect((body as { error: { message: string } }).error.message).toMatch(
      /onboarding/i,
    );
  });

  it("lists course-scoped content with signed pdf urls", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [
      [{ name: "student" }],
      [{ departmentId: 2, levelId: 1 }],
      [{ facultyId: 7 }],
      [],
      [{ mode: "manual", manualOverride: "harmattan" }],
      [
        {
          id: 10,
          type: "article",
          title: "Kinetics Notes",
          bodyOrFileUrl: "Markdown body here",
          courseCode: "CHE 301",
        },
      ],
    ]);

    const res = await GET(jsonRequest(url("?courseId=4")));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const rows = (body as { data: Array<Record<string, unknown>> }).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].courseCode).toBe("CHE 301");
    expect(rows[0].fileUrl).toBeUndefined();
    expect(createResourceSignedUrl).not.toHaveBeenCalled();
  });

  it("signs pdf urls for students too", async () => {
    requireAuth.mockResolvedValue({ userId: 5, roleId: 3 });
    stubSelect(db, [
      [{ name: "student" }],
      [{ departmentId: 2, levelId: 1 }],
      [{ facultyId: 7 }],
      [],
      [{ mode: "manual", manualOverride: "harmattan" }],
      [
        {
          id: 11,
          type: "pdf",
          title: "Week 4 Reading",
          bodyOrFileUrl: "resources/science/mathematics/100/harmattan/mat-101/w4.pdf",
          courseCode: "MAT 101",
        },
      ],
    ]);

    const res = await GET(jsonRequest(url()));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const rows = (body as { data: Array<Record<string, unknown>> }).data;
    expect(rows[0].fileUrl).toBe("https://signed.example/pdf");
    expect(createResourceSignedUrl).toHaveBeenCalledWith(
      "resources/science/mathematics/100/harmattan/mat-101/w4.pdf",
    );
  });
});
