// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth, uploadResourceObject, removeResourceObject } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  uploadResourceObject: vi.fn(),
  removeResourceObject: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireAuth }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/storage/supabase-storage", () => ({
  uploadResourceObject,
  removeResourceObject,
}));

import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  jsonRequest,
  makeDbMock,
  stubDelete,
  stubInsert,
  stubSelect,
} from "@/lib/testing/route-test";
import type { DbMock } from "@/lib/testing/route-test";

let db: DbMock;

beforeEach(() => {
  vi.clearAllMocks();
  uploadResourceObject.mockResolvedValue(undefined);
  removeResourceObject.mockResolvedValue(undefined);
  db = makeDbMock();
});

function pdfRequest(body: Record<string, string>, file?: File): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.set(k, v);
  if (file) form.set("file", file);
  return new Request("http://localhost/api/admin/content", {
    method: "POST",
    body: form,
  });
}

const COURSE_ROW = {
  code: "MAT 101",
  semester: "harmattan",
  scopeType: "department",
  levelValue: 100,
  departmentName: "Mathematics",
  facultyName: "Science",
};

describe("GET /api/admin/content", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await GET(jsonRequest("http://localhost/api/admin/content"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await GET(jsonRequest("http://localhost/api/admin/content"));
    expect(res.status).toBe(403);
  });

  it("lists content items with course/subject labels", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [
      [
        {
          id: 1,
          type: "pdf",
          title: "Week 4 Reading",
          courseCode: "CHE 301",
          subjectName: null,
        },
      ],
    ]);
    const res = await GET(jsonRequest("http://localhost/api/admin/content"));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(
      (body as { data: Array<{ title: string }> }).data[0].title,
    ).toBe("Week 4 Reading");
  });
});

describe("POST /api/admin/content — article (JSON)", () => {
  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "B",
        courseId: 1,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "B",
        courseId: 1,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates an article scoped to a course and stores the body inline", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[{ id: 7 }]]);
    stubInsert(db, [
      {
        id: 10,
        type: "article",
        title: "Kinetics",
        bodyOrFileUrl: "Some markdown",
        courseId: 7,
        jambSubjectId: null,
      },
    ]);

    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "Kinetics",
        body: "Some markdown",
        courseId: 7,
      }),
    );
    expect(res.status).toBe(201);
    expect(uploadResourceObject).not.toHaveBeenCalled();
  });

  it("rejects a scope with both courseId and jambSubjectId (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "B",
        courseId: 1,
        jambSubjectId: 2,
      }),
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    const details = (body as { error: { details: Array<{ message: string }> } })
      .error.details;
    expect(details.some((d) => /exactly one scope/i.test(d.message))).toBe(true);
  });

  it("rejects a scope with neither courseId nor jambSubjectId (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "B",
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the course does not exist", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[]]);
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "B",
        courseId: 999,
      }),
    );
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expect((body as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("returns 422 with details when the article body is empty", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const res = await POST(
      jsonRequest("http://localhost/api/admin/content", "POST", {
        type: "article",
        title: "T",
        body: "",
        jambSubjectId: 3,
      }),
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expect(
      (body as { error: { details: unknown[] } }).error.details.length,
    ).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/content — pdf (multipart)", () => {
  function makePdf(name = "reading.pdf"): File {
    return new File(["%PDF-1.4 fake"], name, { type: "application/pdf" });
  }

  it("uploads a student-scoped PDF to Storage at the §6 path and returns 201", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[{ id: 5 }], [COURSE_ROW], [{ mode: "manual", manualOverride: "harmattan" }]]);
    stubInsert(db, [
      {
        id: 11,
        type: "pdf",
        title: "Week 4 Reading",
        bodyOrFileUrl:
          "resources/science/mathematics/100/harmattan/mat-101/reading.pdf",
      },
    ]);

    const res = await POST(
      pdfRequest({ title: "Week 4 Reading", courseId: "5" }, makePdf()),
    );
    expect(res.status).toBe(201);
    expect(uploadResourceObject).toHaveBeenCalledTimes(1);
    const [pathArg] = uploadResourceObject.mock.calls[0] as [string, Blob];
    expect(pathArg).toBe(
      "resources/science/mathematics/100/harmattan/mat-101/reading.pdf",
    );
  });

  it("uploads an aspirant-scoped PDF to the jamb path", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[{ id: 3 }], [{ name: "Physics" }]]);
    stubInsert(db, [{ id: 12, type: "pdf" }]);

    const res = await POST(
      pdfRequest(
        { title: "Formula Sheet", jambSubjectId: "3" },
        makePdf("sheet.pdf"),
      ),
    );
    expect(res.status).toBe(201);
    const [pathArg] = uploadResourceObject.mock.calls[0] as [string, Blob];
    expect(pathArg).toBe("resources/jamb/physics/sheet.pdf");
  });

  it("rejects a non-PDF file (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const res = await POST(pdfRequest({ title: "T", courseId: "1" }, txt));
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expect((body as { error: { message: string } }).error.message).toMatch(
      /only pdf/i,
    );
  });

  it("rejects an oversized PDF (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const big = new File([new ArrayBuffer(21 * 1024 * 1024)], "big.pdf", {
      type: "application/pdf",
    });
    const res = await POST(pdfRequest({ title: "T", courseId: "1" }, big));
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expect((body as { error: { message: string } }).error.message).toMatch(
      /20 MB/,
    );
  });

  it("rejects a multipart post with no file (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const res = await POST(pdfRequest({ title: "T", courseId: "1" }));
    expect(res.status).toBe(422);
  });

  it("propagates scope XOR errors in multipart too (422)", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    const res = await POST(
      pdfRequest(
        { title: "T", courseId: "1", jambSubjectId: "2" },
        makePdf(),
      ),
    );
    expect(res.status).toBe(422);
    expect(uploadResourceObject).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/content/[id]", () => {
  const params = Promise.resolve({ id: "9" });

  it("returns 401 without a token", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("Missing auth token"));
    const res = await DELETE(
      jsonRequest("http://localhost/api/admin/content/9", "DELETE"),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    requireAuth.mockRejectedValue(new ForbiddenError("Not allowed"));
    const res = await DELETE(
      jsonRequest("http://localhost/api/admin/content/9", "DELETE"),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown item", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[]]);
    const res = await DELETE(
      jsonRequest("http://localhost/api/admin/content/9", "DELETE"),
      { params },
    );
    expect(res.status).toBe(404);
  });

  it("removes the Storage object for a PDF and returns 204", async () => {
    requireAuth.mockResolvedValue({ userId: 1, roleId: 2 });
    stubSelect(db, [[{ id: 9, type: "pdf", bodyOrFileUrl: "resources/jamb/physics/a.pdf" }]]);
    stubDelete(db, { id: 9 });
    const res = await DELETE(
      jsonRequest("http://localhost/api/admin/content/9", "DELETE"),
      { params },
    );
    expect(res.status).toBe(204);
    expect(removeResourceObject).toHaveBeenCalledWith("resources/jamb/physics/a.pdf");
  });
});
