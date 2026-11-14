import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { getTeachingScope, isTrackAllowed } from "@/lib/auth/teaching-scope";
import { getDb, type Db } from "@/lib/db";
import {
  attemptAnswers,
  bestScores,
  questionBlanks,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
  users,
} from "@/lib/db/schema";
import { ownedQuiz } from "./quiz-builder";
import { quizImageUrls } from "./quiz-image-urls";
import { resolveQuizRichText } from "@/lib/quizzes/images";
import {
  gradeWeightedAttempt,
  type WeightedGradingQuestion,
  type WeightedSubmittedAnswer,
} from "@/lib/scoring/weighted-attempt";
import type { z } from "zod";
import type { manualQuizGradeSchema } from "@/lib/validation/quiz-builder";

export async function quizGradingQuestions(
  db: Pick<Db, "select">,
  id: number,
): Promise<WeightedGradingQuestion[]> {
  const rows = await db
    .select({
      id: questions.id,
      questionType: questions.questionType,
      marks: quizQuestions.marks,
    })
    .from(quizQuestions)
    .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.sortOrder));
  const ids = rows.map((r) => r.id);
  const options = ids.length
    ? await db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, ids))
        .orderBy(asc(questionOptions.sortOrder))
    : [];
  const blanks = ids.length
    ? await db
        .select()
        .from(questionBlanks)
        .where(inArray(questionBlanks.questionId, ids))
        .orderBy(asc(questionBlanks.blankIndex))
    : [];
  return rows.map((q) => ({
    ...q,
    marks: q.marks ?? 1,
    options: options
      .filter((o) => o.questionId === q.id)
      .map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    blanks: blanks
      .filter((b) => b.questionId === q.id)
      .map((b) => ({ blankIndex: b.blankIndex, acceptedAnswer: b.acceptedAnswer })),
  }));
}
export async function listPendingQuizEssays(id: number, auth: AuthContext) {
  const db = getDb();
  await ownedQuiz(db, id, auth);
  const attempts = await db
    .select({
      id: quizAttempts.id,
      studentName: users.fullName,
      attemptNumber: quizAttempts.attemptNumber,
      submittedAt: quizAttempts.submittedAt,
    })
    .from(quizAttempts)
    .innerJoin(users, eq(users.id, quizAttempts.userId))
    .where(
      and(
        eq(quizAttempts.quizId, id),
        isNotNull(quizAttempts.submittedAt),
        isNull(quizAttempts.score),
      ),
    )
    .orderBy(asc(quizAttempts.id));
  const essays = await db
    .select({
      id: questions.id,
      bodyRichText: questions.bodyRichText,
      marks: quizQuestions.marks,
    })
    .from(quizQuestions)
    .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
    .where(and(eq(quizQuestions.quizId, id), eq(questions.questionType, "essay")))
    .orderBy(asc(quizQuestions.sortOrder));
  const answers = attempts.length
    ? await db
        .select()
        .from(attemptAnswers)
        .where(
          inArray(
            attemptAnswers.attemptId,
            attempts.map((a) => a.id),
          ),
        )
        .orderBy(asc(attemptAnswers.id))
    : [];
  const urls = await quizImageUrls(
    db,
    id,
    essays.map((q) => q.bodyRichText),
  );
  return attempts.map((attempt) => ({
    ...attempt,
    essays: essays.map((q) => ({
      ...q,
      bodyRichText: resolveQuizRichText(q.bodyRichText, urls),
      answer:
        answers.find((a) => a.attemptId === attempt.id && a.questionId === q.id)
          ?.textAnswer ?? "",
      awardedMarks:
        answers.find((a) => a.attemptId === attempt.id && a.questionId === q.id)
          ?.awardedMarks ?? null,
    })),
  }));
}
export async function gradeQuizEssays(
  id: number,
  auth: AuthContext,
  input: z.infer<typeof manualQuizGradeSchema>,
) {
  await getDb().transaction(async (tx) => {
    const quiz = await ownedQuiz(tx, id, auth);
    if (!isTrackAllowed(await getTeachingScope(tx, auth), quiz))
      throw new QuizAuthoringError(403, "This quiz is outside your teaching assignments");
    const [attempt] = await tx
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.id, input.attemptId), eq(quizAttempts.quizId, id)))
      .limit(1);
    if (!attempt) throw new QuizAuthoringError(404, "Attempt not found");
    if (!attempt.submittedAt || attempt.releasedAt || attempt.score !== null)
      throw new QuizAuthoringError(409, "This attempt is not awaiting manual grading");
    const gradingQuestions = await quizGradingQuestions(tx, id);
    const essays = gradingQuestions.filter((q) => q.questionType === "essay");
    if (
      input.answers.length !== essays.length ||
      input.answers.some(
        (a) => !essays.some((q) => q.id === a.questionId && a.awardedMarks <= q.marks),
      )
    )
      throw new QuizAuthoringError(422, "Assign valid marks to every essay", [
        { field: "answers", message: "Grade every essay within its configured marks" },
      ]);
    const stored = await tx
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, input.attemptId))
      .orderBy(asc(attemptAnswers.id));
    const answers: WeightedSubmittedAnswer[] = gradingQuestions.map((q) => {
      const rows = stored.filter((a) => a.questionId === q.id);
      return {
        questionId: q.id,
        selectedOptionId: rows[0]?.selectedOptionId ?? null,
        essayAnswer: q.questionType === "essay" ? rows[0]?.textAnswer : null,
        blankAnswers: Object.fromEntries(
          rows
            .filter((a) => a.blankIndex !== null)
            .map((a) => [a.blankIndex!, a.textAnswer ?? ""]),
        ),
      };
    });
    const result = gradeWeightedAttempt(
      gradingQuestions,
      answers,
      quiz.deductMarksForWrong,
      new Map(input.answers.map((a) => [a.questionId, a.awardedMarks])),
    );
    if (result.score === null)
      throw new QuizAuthoringError(422, "Every essay must be graded");
    const [updated] = await tx
      .update(quizAttempts)
      .set({ score: result.score.toFixed(2) })
      .where(
        and(
          eq(quizAttempts.id, input.attemptId),
          isNull(quizAttempts.score),
          isNull(quizAttempts.releasedAt),
        ),
      )
      .returning({ id: quizAttempts.id });
    if (!updated)
      throw new QuizAuthoringError(409, "This attempt was graded in another session");
    for (const award of input.answers)
      await tx
        .update(attemptAnswers)
        .set({ awardedMarks: award.awardedMarks })
        .where(
          and(
            eq(attemptAnswers.attemptId, input.attemptId),
            eq(attemptAnswers.questionId, award.questionId),
          ),
        );
    await tx
      .insert(bestScores)
      .values({
        userId: attempt.userId,
        quizId: id,
        bestScore: result.score.toFixed(2),
        achievedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [bestScores.userId, bestScores.quizId],
        set: { bestScore: sql`greatest(${bestScores.bestScore}, excluded.best_score)` },
      });
  });
}
