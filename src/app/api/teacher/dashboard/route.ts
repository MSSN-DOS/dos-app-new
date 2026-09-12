import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { questions, quizzes } from "@/lib/db/schema";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["teacher"]);
    const db = getDb();
    const teacherId = auth.userId;

    const [allQuestions, publishedQuizzes, recent] = await Promise.all([
      db.select({ id: questions.id }).from(questions).where(eq(questions.createdBy, teacherId)),
      db
        .select({ id: quizzes.id })
        .from(quizzes)
        .where(and(eq(quizzes.createdBy, teacherId), eq(quizzes.status, "published"))),
      db
        .select({
          id: quizzes.id,
          title: quizzes.title,
          status: quizzes.status,
          quizType: quizzes.quizType,
          updatedAt: quizzes.createdAt,
        })
        .from(quizzes)
        .where(eq(quizzes.createdBy, teacherId))
        .orderBy(desc(quizzes.createdAt))
        .limit(5),
    ]);

    return NextResponse.json({
      counts: {
        questionsAuthored: allQuestions.length,
        quizzesPublished: publishedQuizzes.length,
      },
      recent,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
