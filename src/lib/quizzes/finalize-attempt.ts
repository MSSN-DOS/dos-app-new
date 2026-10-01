import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/lib/db";
import {
  questionBlanks,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
} from "@/lib/db/schema";
import { attemptAnswers } from "@/lib/db/schema/quizzes";
import { bestScores } from "@/lib/db/schema/performance";
import { gradeAttempt, type GradingQuestion } from "@/lib/scoring/grade-attempt";

/**
 * The exact surface this module uses — `select`, `insert`, `update` and nothing else.
 *
 * Deliberately not `Db`. `Db` carries a required `$client` property that only the top-level
 * database has, so a `PgTransaction` (what `db.transaction` hands its callback) is not assignable
 * to it. Typing the parameter as the union `Db | PgTransaction<…>` would mean importing drizzle's
 * transaction generics, which are schema-dependent and unstable across versions.
 *
 * `Pick<Db, …>` states the real requirement instead: this function needs a query builder, and both
 * the database and a transaction are one. It also keeps the caller honest — if this ever needs to
 * reach the raw client, the parameter type stops accepting it and the author has to think again.
 */
type AttemptWriter = Pick<Db, "select" | "insert" | "update">;

/**
 * Finalise an attempt that has no answers saved server-side, grading it as zero.
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * This was a private helper in `api/quizzes/[id]/attempt/route.ts`, reachable only from the
 * GET gate. That was the whole of R-1: the unpublish path had no way to rescue a stranded
 * attempt, because the only code that could finalise one lived behind a `status === "published"`
 * check that unpublish had just removed. A fix inside the route would have had to duplicate the
 * body. Both callers now share one implementation.
 *
 * WHY THE SCORE IS ALWAYS ZERO
 * ----------------------------
 * Answers exist only in the browser until POST — there is no autosave endpoint, so by definition
 * anything reaching this function has nothing saved. `gradeAttempt` is still called rather than
 * writing a literal `"0.00"`, because it is what produces the per-question verdict rows below and
 * those are what `attempt_answers` needs to stay consistent with `quizzes.totalScore`.
 *
 * The important part is NOT the score. It is that the attempt is finalised *at all*: an attempt
 * with `submittedAt IS NULL` is invisible to the "already attempted" guard, so a stranded attempt
 * silently hands the student a free retake. That is the loss R-1 is about.
 *
 * AGENTS.md §3: only Course Quiz results feed CGPA, Post-UTME and the leaderboard, and scores stay
 * held (`released_at IS NULL`) until an Admin releases them. Writing the score here does not
 * release it, and `apply-release` filters on `quizType = 'course'` regardless of who finalised
 * the attempt.
 *
 * @returns `true` if this call is what finalised the attempt, `false` if it was already
 *   finalised (the `isNull(submittedAt)` guard makes this safe to race).
 */
export async function finalizeUnsubmittedAttempt(
  db: AttemptWriter,
  attemptId: number,
  quizId: number,
  userId: number,
): Promise<boolean> {
  const attachedRows = await db
    .select({ id: questions.id, questionType: questions.questionType })
    .from(quizQuestions)
    .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(questions.id));
  const attachedIds = attachedRows.map((r) => r.id);

  // One `IN ()` per question table rather than a join: `questions` and `question_options` have no
  // relationship in the schema, only `quizQuestions` → `questions`, so a join would multiply rows.
  const optionRows =
    attachedIds.length > 0
      ? await db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            isCorrect: questionOptions.isCorrect,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, attachedIds))
          .orderBy(asc(questionOptions.id))
      : [];
  const blankRows =
    attachedIds.length > 0
      ? await db
          .select({
            questionId: questionBlanks.questionId,
            blankIndex: questionBlanks.blankIndex,
            acceptedAnswer: questionBlanks.acceptedAnswer,
          })
          .from(questionBlanks)
          .where(inArray(questionBlanks.questionId, attachedIds))
          .orderBy(asc(questionBlanks.blankIndex))
      : [];

  const gradingQuestions: GradingQuestion[] = attachedRows.map((row) => ({
    id: row.id,
    questionType: row.questionType,
    options: optionRows
      .filter((o) => o.questionId === row.id)
      .map((o) => ({ id: o.id, isCorrect: o.isCorrect ?? false }))
      .sort((a, b) => a.id - b.id),
    blanks: blankRows
      .filter((b) => b.questionId === row.id)
      .map((b) => ({ blankIndex: b.blankIndex, acceptedAnswer: b.acceptedAnswer }))
      .sort((a, b) => (a.blankIndex ?? 0) - (b.blankIndex ?? 0)),
  }));

  const result = gradeAttempt(gradingQuestions, []);

  // The `isNull(submittedAt)` in the WHERE clause is the concurrency guard: a student POSTing
  // their real answers at the same moment gets exactly one winner, and the loser returns `false`.
  const [row] = await db
    .update(quizAttempts)
    .set({ score: result.score.toFixed(2), submittedAt: new Date() })
    .where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.submittedAt)))
    .returning({ id: quizAttempts.id });
  if (!row) return false;

  // Record a per-question row for every question even though nothing was answered, so
  // `attempt_answers` covers the whole quiz the way a normal submission does.
  const attemptAnswerValues: (typeof attemptAnswers.$inferInsert)[] = [];
  gradingQuestions.forEach((question, i) => {
    const verdict = result.results[i];
    if (question.questionType === "options") {
      attemptAnswerValues.push({
        attemptId: row.id,
        questionId: question.id,
        selectedOptionId: null,
        textAnswer: null,
        blankIndex: null,
        isCorrect: verdict.isCorrect,
      });
    } else {
      question.blanks.forEach((blank) => {
        attemptAnswerValues.push({
          attemptId: row.id,
          questionId: question.id,
          selectedOptionId: null,
          textAnswer: null,
          blankIndex: blank.blankIndex,
          isCorrect: false,
        });
      });
    }
  });
  if (attemptAnswerValues.length > 0) {
    await db.insert(attemptAnswers).values(attemptAnswerValues);
  }

  // Best score only ever moves up. A zero from a stranded attempt can never displace a real one.
  const [existingBest] = await db
    .select({ bestScore: bestScores.bestScore })
    .from(bestScores)
    .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)))
    .limit(1);
  if (!existingBest) {
    await db
      .insert(bestScores)
      .values({
        userId,
        quizId,
        bestScore: result.score.toFixed(2),
        achievedAt: new Date(),
      });
  } else if (result.score > Number(existingBest.bestScore)) {
    await db
      .update(bestScores)
      .set({ bestScore: result.score.toFixed(2), achievedAt: new Date() })
      .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)));
  }

  return true;
}