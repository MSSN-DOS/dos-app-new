import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { attemptAnswers, quizAttempts, questions, quizQuestions } from "@/lib/db/schema";
export interface QuestionAnalysis {
  questionId: number;
  label: string;
  attempts: number;
  accuracy: number | null;
  averageMarks: number | null;
  marks: number;
  manuallyGraded: boolean;
}
export async function quizQuestionAnalysis(
  db: Pick<Db, "select">,
  quizId: number,
): Promise<QuestionAnalysis[]> {
  // The release predicate is part of the query; held answer outcomes never enter charts.
  const rows = await db
    .select({
      questionId: questions.id,
      questionType: questions.questionType,
      sortOrder: quizQuestions.sortOrder,
      marks: quizQuestions.marks,
      attemptId: quizAttempts.id,
      isCorrect: attemptAnswers.isCorrect,
      awardedMarks: attemptAnswers.awardedMarks,
    })
    .from(attemptAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, attemptAnswers.attemptId))
    .innerJoin(
      quizQuestions,
      and(
        eq(quizQuestions.questionId, attemptAnswers.questionId),
        eq(quizQuestions.quizId, quizAttempts.quizId),
      ),
    )
    .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(
      and(
        eq(quizAttempts.quizId, quizId),
        isNotNull(quizAttempts.releasedAt),
        isNotNull(quizAttempts.submittedAt),
      ),
    )
    .orderBy(asc(quizQuestions.sortOrder));
  const questionsById = new Map<
    number,
    { row: (typeof rows)[number]; attempts: Map<number, typeof rows> }
  >();
  for (const row of rows) {
    let entry = questionsById.get(row.questionId);
    if (!entry) {
      entry = { row, attempts: new Map() };
      questionsById.set(row.questionId, entry);
    }
    entry.attempts.set(row.attemptId, [
      ...(entry.attempts.get(row.attemptId) ?? []),
      row,
    ]);
  }
  return [...questionsById.values()].map(({ row, attempts }) => {
    const outcomes = [...attempts.values()];
    const awards = outcomes.map((answers) =>
      answers.reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0),
    );
    const correct = outcomes.filter((answers, i) =>
      row.questionType === "essay"
        ? awards[i] >= row.marks
        : answers.every((a) => a.isCorrect === true),
    ).length;
    return {
      questionId: row.questionId,
      label: `Q${row.sortOrder + 1}`,
      marks: row.marks,
      manuallyGraded: row.questionType === "essay",
      attempts: outcomes.length,
      accuracy: outcomes.length
        ? Math.round((correct / outcomes.length) * 10000) / 100
        : null,
      averageMarks: awards.length
        ? Math.round(
            (awards.reduce((sum, value) => sum + value, 0) / awards.length) * 100,
          ) / 100
        : null,
    };
  });
}
