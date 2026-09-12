import { and, asc, eq, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { courses, jambSubjects, quizzes } from "@/lib/db/schema";
import { quizCreateSchema } from "@/lib/validation/quizzes";

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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const db = getDb();
    const params = new URL(request.url).searchParams;
    const pagination = parsePagination(params);
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }
    const typeParam = params.get("type");
    const courseIdParam = params.get("courseId");

    const conds: SQL[] = [];
    if (typeParam === "topic" || typeParam === "course") {
      conds.push(eq(quizzes.quizType, typeParam));
    }
    if (courseIdParam && /^\d+$/.test(courseIdParam)) {
      conds.push(eq(quizzes.courseId, Number(courseIdParam)));
    }
    const owner = ownershipScope(auth);
    if (owner !== null) conds.push(eq(quizzes.createdBy, owner));

    const base = db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        quizType: quizzes.quizType,
        courseId: quizzes.courseId,
        jambSubjectId: quizzes.jambSubjectId,
        topicId: quizzes.topicId,
        weekStart: quizzes.weekStart,
        questionCount: quizzes.questionCount,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        passMark: quizzes.passMark,
        allowMultipleAttempts: quizzes.allowMultipleAttempts,
        loseFocusPolicy: quizzes.loseFocusPolicy,
        instructions: quizzes.instructions,
        description: quizzes.description,
        status: quizzes.status,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
        createdBy: quizzes.createdBy,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id));

    const rows =
      conds.length > 0
        ? await base.where(and(...conds)).orderBy(asc(quizzes.id))
        : await base.orderBy(asc(quizzes.id));

    return NextResponse.json(paginate(rows, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const body = await request.json();
    const input = quizCreateSchema.parse(body);
    const db = getDb();

    const [row] = await db
      .insert(quizzes)
      .values({
        title: input.title,
        quizType: input.quizType,
        courseId: input.courseId ?? null,
        jambSubjectId: input.jambSubjectId ?? null,
        topicId: input.topicId ?? null,
        weekStart: input.weekStart ?? null,
        timeLimitMinutes: 30,
        passMark: 50,
        status: "draft",
        createdBy: auth.userId,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
