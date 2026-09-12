import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import {
  courses,
  jambSubjects,
  questions,
  quizzes,
  quizQuestions,
} from "@/lib/db/schema";
import { quizUpdateSchema } from "@/lib/validation/quizzes";

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

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }
    const db = getDb();

    const base = db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        description: quizzes.description,
        instructions: quizzes.instructions,
        quizType: quizzes.quizType,
        courseId: quizzes.courseId,
        topicId: quizzes.topicId,
        jambSubjectId: quizzes.jambSubjectId,
        weekStart: quizzes.weekStart,
        questionCount: quizzes.questionCount,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        passMark: quizzes.passMark,
        allowMultipleAttempts: quizzes.allowMultipleAttempts,
        loseFocusPolicy: quizzes.loseFocusPolicy,
        status: quizzes.status,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
        createdBy: quizzes.createdBy,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id));

    const [row] = await base.where(eq(quizzes.id, id)).orderBy(asc(quizzes.id));
    if (!row || !forbiddenUnlessOwned(auth, row.createdBy)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    const attached = await db
      .select({
        questionId: questions.id,
        bodyRichText: questions.bodyRichText,
        questionType: questions.questionType,
        topicId: questions.topicId,
        status: questions.status,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(questions.id));

    return NextResponse.json({ ...row, questions: attached });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const input = quizUpdateSchema.parse(body);
    const db = getDb();

    const [existing] = await db
      .select({
        id: quizzes.id,
        quizType: quizzes.quizType,
        status: quizzes.status,
        createdBy: quizzes.createdBy,
      })
      .from(quizzes)
      .where(eq(quizzes.id, id))
      .orderBy(asc(quizzes.id));
    if (!existing || !forbiddenUnlessOwned(auth, existing.createdBy)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    if (existing.status === "published") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This quiz is published and can no longer be edited",
          },
        },
        { status: 409 },
      );
    }

    if (existing.quizType === "course") {
      if (input.weekStart == null) {
        return validationError(
          new ZodError([
            {
              code: "custom",
              path: ["weekStart"],
              message: "Course quizzes need a week start date",
            },
          ]),
        );
      }
      if (input.questionCount !== 50) {
        return validationError(
          new ZodError([
            {
              code: "custom",
              path: ["questionCount"],
              message: "Course quizzes are fixed at 50 questions",
            },
          ]),
        );
      }
    } else if (input.weekStart != null) {
      return validationError(
        new ZodError([
          {
            code: "custom",
            path: ["weekStart"],
            message: "Topic quizzes are not tied to a week",
          },
        ]),
      );
    }

    const [row] = await db
      .update(quizzes)
      .set({
        title: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        questionCount: input.questionCount,
        timeLimitMinutes: input.timeLimitMinutes,
        passMark: input.passMark,
        allowMultipleAttempts: input.allowMultipleAttempts,
        loseFocusPolicy: input.loseFocusPolicy,
        ...(input.weekStart !== undefined
          ? { weekStart: input.weekStart }
          : {}),
      })
      .where(eq(quizzes.id, id))
      .returning();

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
