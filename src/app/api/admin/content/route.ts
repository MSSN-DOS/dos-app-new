import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  contentItems,
  courses,
  departments,
  faculties,
  jambSubjects,
  levels,
} from "@/lib/db/schema";
import { getActiveSemester } from "@/lib/semester";
import {
  aspirantResourcePath,
  resourceFilePath,
  studentResourcePath,
} from "@/lib/storage/content-paths";
import { uploadResourceObject } from "@/lib/storage/supabase-storage";
import {
  articleCreateSchema,
  isPdfFile,
  MAX_PDF_BYTES,
  pdfMetaSchema,
} from "@/lib/validation/content";

function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "body",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

// Resolve the §6 storage folder for a course-scoped item. General/interfaculty
// courses have no single faculty/department — their scope_type stands in for
// those segments (flagged in STATE.md pending a Board ruling on path shape).
async function resolveStudentFolder(
  db: ReturnType<typeof getDb>,
  courseId: number,
): Promise<string> {
  const [row] = await db
    .select({
      code: courses.code,
      semester: courses.semester,
      scopeType: courses.scopeType,
      levelValue: levels.value,
      departmentName: departments.name,
      facultyName: faculties.name,
    })
    .from(courses)
    .innerJoin(levels, eq(courses.levelId, levels.id))
    .leftJoin(departments, eq(courses.departmentId, departments.id))
    .leftJoin(faculties, eq(courses.facultyId, faculties.id))
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!row) throw new Error("Course not found");

  const semester = await getActiveSemester(db);
  return studentResourcePath({
    faculty: row.facultyName ?? row.scopeType,
    department: row.departmentName ?? row.scopeType,
    level: String(row.levelValue),
    semester,
    course: row.code,
  });
}

async function resolveAspirantFolder(
  db: ReturnType<typeof getDb>,
  jambSubjectId: number,
): Promise<string> {
  const [subject] = await db
    .select({ name: jambSubjects.name })
    .from(jambSubjects)
    .where(eq(jambSubjects.id, jambSubjectId))
    .limit(1);
  if (!subject) throw new Error("JAMB subject not found");
  return aspirantResourcePath({ jambSubject: subject.name });
}

type ParsedInput = {
  type: "pdf" | "article";
  title: string;
  body?: string;
  courseId?: number;
  jambSubjectId?: number;
  file?: File;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const rows = await getDb()
      .select({
        id: contentItems.id,
        type: contentItems.type,
        title: contentItems.title,
        courseId: contentItems.courseId,
        jambSubjectId: contentItems.jambSubjectId,
        createdAt: contentItems.createdAt,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
      })
      .from(contentItems)
      .leftJoin(courses, eq(contentItems.courseId, courses.id))
      .leftJoin(jambSubjects, eq(contentItems.jambSubjectId, jambSubjects.id))
      .orderBy(desc(contentItems.createdAt));
    return NextResponse.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireAuth(request, ["admin"]);
    const isMultipart = (
      request.headers.get("content-type") ?? ""
    ).includes("multipart/form-data");

    let input: ParsedInput;

    if (isMultipart) {
      const form = await request.formData();
      const file = form.get("file");
      input = {
        type: file instanceof File ? "pdf" : "article",
        title: String(form.get("title") ?? ""),
        body: form.get("body") === null ? undefined : String(form.get("body")),
        courseId: form.get("courseId") ? Number(form.get("courseId")) : undefined,
        jambSubjectId: form.get("jambSubjectId")
          ? Number(form.get("jambSubjectId"))
          : undefined,
        file: file instanceof File ? file : undefined,
      };
    } else {
      // JSON body: articles only — PDFs must go through multipart.
      const json: unknown = await request.json();
      const record = json as Record<string, unknown>;
      input = {
        type: "article",
        title: String(record.title ?? ""),
        body: record.body === undefined ? undefined : String(record.body),
        courseId: record.courseId === undefined ? undefined : Number(record.courseId),
        jambSubjectId:
          record.jambSubjectId === undefined
            ? undefined
            : Number(record.jambSubjectId),
      };
    }

    if (input.type === "article") {
      const result = articleCreateSchema.safeParse({
        type: "article",
        title: input.title,
        body: input.body,
        courseId: input.courseId,
        jambSubjectId: input.jambSubjectId,
      });
      if (!result.success) return validationError(result.error);
      input = { ...input, ...result.data };
    } else {
      // PDF track: metadata validated here, the File itself at the route boundary.
      if (!input.file) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "A PDF file is required" } },
          { status: 422 },
        );
      }
      if (!isPdfFile(input.file)) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Only PDF files are allowed" } },
          { status: 422 },
        );
      }
      if (input.file.size > MAX_PDF_BYTES) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: `PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB limit`,
            },
          },
          { status: 422 },
        );
      }
      // MIME is client-controlled — verify PDF magic bytes server-side.
      const header = new TextDecoder().decode(
        new Uint8Array(await input.file.slice(0, 5).arrayBuffer()),
      );
      if (header !== "%PDF-") {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "File is not a valid PDF" } },
          { status: 422 },
        );
      }
      const result = pdfMetaSchema.safeParse({
        type: "pdf",
        title: input.title,
        courseId: input.courseId,
        jambSubjectId: input.jambSubjectId,
      });
      if (!result.success) return validationError(result.error);
      input = { ...input, ...result.data };
    }

    const db = getDb();

    // Verify the scoped target exists before writing anything to Storage.
    let folder: string | undefined;
    if (input.courseId !== undefined) {
      const [course] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);
      if (!course) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Course not found" } },
          { status: 404 },
        );
      }
    }
    if (input.jambSubjectId !== undefined) {
      const [subject] = await db
        .select({ id: jambSubjects.id })
        .from(jambSubjects)
        .where(eq(jambSubjects.id, input.jambSubjectId))
        .limit(1);
      if (!subject) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "JAMB subject not found" } },
          { status: 404 },
        );
      }
    }

    // PDFs land in Storage at the §6 path; articles store their body inline.
    let storedValue: string;
    if (input.type === "pdf" && input.file) {
      folder =
        input.courseId !== undefined
          ? await resolveStudentFolder(db, input.courseId)
          : await resolveAspirantFolder(db, input.jambSubjectId as number);
      const objectPath = resourceFilePath(folder, input.file.name);
      await uploadResourceObject(objectPath, input.file);
      storedValue = objectPath;
    } else {
      storedValue = input.body as string;
    }

    const [row] = await db
      .insert(contentItems)
      .values({
        type: input.type,
        title: input.title,
        bodyOrFileUrl: storedValue,
        courseId: input.courseId,
        jambSubjectId: input.jambSubjectId,
        uploadedBy: session.userId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
