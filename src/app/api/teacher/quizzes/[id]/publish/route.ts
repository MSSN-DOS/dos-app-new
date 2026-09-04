import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { questions, quizzes, quizQuestions } from "@/lib/db/schema";

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

    const db = getDb();

    const [quiz] = await db
      .select({
        id: quizzes.id,
        questionCount: quizzes.questionCount,
        title: quizzes.title,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        passMark: quizzes.passMark,
        createdBy: quizzes.createdBy,
      })
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
            message: "You can only publish quizzes you created",
          },
        },
        { status: 403 },
      );
    }

    if (!quiz.title || quiz.title.trim() === "") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "title",
                code: "custom",
                message: "Quiz needs a title before publishing",
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    const attached = await db
      .select({
        questionId: quizQuestions.questionId,
        questionStatus: questions.status,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.questionId));

    if (attached.length < quiz.questionCount) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "questionCount",
                code: "custom",
                message: `Attach ${quiz.questionCount - attached.length} more question(s) before publishing (${attached.length} of ${quiz.questionCount} attached)`,
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    const draftIds = attached
      .filter((a) => a.questionStatus !== "published")
      .map((a) => a.questionId);
    if (draftIds.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "questions",
                code: "custom",
                message: `Publish every attached question first — still draft: question(s) ${draftIds.join(", ")}`,
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    const [row] = await db
      .update(quizzes)
      .set({ status: "published" })
      .where(eq(quizzes.id, quizId))
      .returning({ id: quizzes.id, status: quizzes.status });

    return NextResponse.json(row);
  } catch (err) {
    return errorResponse(err);
  }
}
