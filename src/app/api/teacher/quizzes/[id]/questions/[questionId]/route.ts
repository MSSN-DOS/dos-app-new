import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { quizzes, quizQuestions } from "@/lib/db/schema";

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawQuizId, questionId: rawQuestionId } = await params;
    const quizId = parseId(rawQuizId);
    const questionId = parseId(rawQuestionId);
    if (quizId === null || questionId === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
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
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
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

    const deleted = await db
      .delete(quizQuestions)
      .where(
        and(
          eq(quizQuestions.quizId, quizId),
          eq(quizQuestions.questionId, questionId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Question is not attached to this quiz",
          },
        },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
