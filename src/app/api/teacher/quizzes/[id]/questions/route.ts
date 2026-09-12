import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { questions, quizzes, quizQuestions } from "@/lib/db/schema";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const quizId = parseId(rawId);
    if (quizId === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }
    const questionId =
      typeof body === "object" &&
      body !== null &&
      "questionId" in body &&
      Number.isInteger((body as { questionId: unknown }).questionId)
        ? (body as { questionId: number }).questionId
        : null;
    if (questionId === null || questionId < 1) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "questionId",
                code: "invalid_type",
                message: "A positive integer questionId is required",
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    const db = getDb();

    const [quiz] = await db
      .select({ id: quizzes.id, status: quizzes.status, createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .orderBy(asc(quizzes.id));
    if (!quiz) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    if (!forbiddenUnlessOwned(auth, quiz.createdBy)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You can only attach questions to quizzes you created",
          },
        },
        { status: 403 },
      );
    }

    if (quiz.status === "published") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This quiz is published — its question set can no longer change",
          },
        },
        { status: 409 },
      );
    }

    const [question] = await db
      .select({ id: questions.id, status: questions.status, createdBy: questions.createdBy })
      .from(questions)
      .where(eq(questions.id, questionId))
      .orderBy(asc(questions.id));
    if (!question) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Question not found" } },
        { status: 404 },
      );
    }

    if (!forbiddenUnlessOwned(auth, question.createdBy)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You can only attach questions you created",
          },
        },
        { status: 403 },
      );
    }

    if (question.status !== "published") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "questionId",
                code: "custom",
                message: "Only published questions can be attached to a quiz",
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    try {
      await db
        .insert(quizQuestions)
        .values({ quizId, questionId });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "This question is already attached to the quiz",
            },
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { quizId, questionId },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
