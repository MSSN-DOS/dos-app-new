import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  passages,
  questionBlanks,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
  quizzes,
} from "@/lib/db/schema";
import { studentCanAccessQuiz } from "@/lib/quizzes/access";
import { quizDurationSeconds } from "@/lib/quizzes/duration";
import { resolveQuizRichText } from "@/lib/quizzes/images";
import { isCourseQuizWindowOpen } from "@/lib/quizzes/window";
import type { QuizIntroductionData, StudentQuizReview } from "@/lib/quizzes/student";
import type { SubmitAttemptInput } from "@/lib/validation/attempts";
import { quizImageUrls } from "./quiz-image-urls";
import { hasAttemptRemaining } from "@/lib/quizzes/attempt-limit";

async function accessibleQuiz(id: number, auth: AuthContext) {
  const db = getDb();
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!quiz) throw new QuizAuthoringError(404, "Quiz not found");
  if (quiz.status !== "published") {
    const [open] = quiz.unpublishedAt
      ? await db
          .select({ id: quizAttempts.id })
          .from(quizAttempts)
          .where(
            and(
              eq(quizAttempts.quizId, id),
              eq(quizAttempts.userId, auth.userId),
              isNull(quizAttempts.submittedAt),
            ),
          )
          .limit(1)
      : [];
    if (!open) throw new QuizAuthoringError(404, "Quiz not found");
  }
  if (
    auth.roleName === "aspirant"
      ? !quiz.jambSubjectId
      : !(await studentCanAccessQuiz(db, auth.userId, quiz))
  )
    throw new QuizAuthoringError(403, "This quiz is not available to you");
  return quiz;
}
/** Sign only student-visible images: explanation images may reveal answers. */
export async function quizAttemptImageLinks(id: number, auth: AuthContext) {
  const quiz = await accessibleQuiz(id, auth);
  const db = getDb();
  const [openAttempt] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, id),
        eq(quizAttempts.userId, auth.userId),
        isNull(quizAttempts.submittedAt),
      ),
    )
    .limit(1);
  if (!openAttempt)
    throw new QuizAuthoringError(409, "Start the quiz before loading question images");
  const [rows, options] = await Promise.all([
    db
      .select({ body: questions.bodyRichText, passage: passages.bodyRichText })
      .from(quizQuestions)
      .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
      .leftJoin(passages, eq(passages.id, questions.passageId))
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.sortOrder)),
    db
      .select({ text: questionOptions.optionText })
      .from(quizQuestions)
      .innerJoin(
        questionOptions,
        eq(questionOptions.questionId, quizQuestions.questionId),
      )
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(questionOptions.sortOrder)),
  ]);
  const urls = await quizImageUrls(
    db,
    id,
    [
      quiz.description ?? "",
      quiz.instructions ?? "",
      ...rows.flatMap((q) => [q.body, q.passage ?? ""]),
      ...options.map((o) => o.text),
    ],
    quiz.coverImagePath,
  );
  return [...urls].map(([path, url]) => ({ path, url }));
}
export async function quizIntroduction(
  id: number,
  auth: AuthContext,
): Promise<QuizIntroductionData> {
  const quiz = await accessibleQuiz(id, auth);
  const db = getDb();
  const marks = await db
    .select({ marks: quizQuestions.marks })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.sortOrder));
  const attempts = await db
    .select({ submittedAt: quizAttempts.submittedAt })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, id), eq(quizAttempts.userId, auth.userId)))
    .orderBy(asc(quizAttempts.id));
  const hasOpenAttempt = attempts.some((a) => a.submittedAt === null);
  const urls = await quizImageUrls(
    db,
    id,
    [quiz.description ?? "", quiz.instructions ?? ""],
    quiz.coverImagePath,
  );
  return {
    title: quiz.title,
    description: resolveQuizRichText(quiz.description ?? "", urls),
    instructions: resolveQuizRichText(quiz.instructions ?? "", urls),
    durationSeconds: quizDurationSeconds(quiz),
    passMark: quiz.passMark,
    questionCount: marks.length,
    totalMarks: marks.reduce((sum, q) => sum + q.marks, 0),
    coverImageUrl: quiz.coverImagePath ? (urls.get(quiz.coverImagePath) ?? null) : null,
    allowMultipleAttempts: quiz.allowMultipleAttempts,
    allowResume: quiz.allowResume,
    deductMarksForWrong: quiz.deductMarksForWrong,
    maxAttempts: quiz.maxAttempts,
    completedAttempts: attempts.filter((a) => a.submittedAt !== null).length,
    hasOpenAttempt,
    canStart:
      hasOpenAttempt ||
      (quiz.status === "published" &&
        hasAttemptRemaining(quiz, attempts.filter((a) => a.submittedAt !== null).length)),
    windowOpen: isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart, undefined, quiz),
  };
}
export async function saveAttemptSnapshot(
  id: number,
  auth: AuthContext,
  input: SubmitAttemptInput,
): Promise<void> {
  const quiz = await accessibleQuiz(id, auth);
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, id),
        eq(quizAttempts.userId, auth.userId),
        isNull(quizAttempts.submittedAt),
      ),
    )
    .limit(1);
  if (!attempt) throw new QuizAuthoringError(409, "There is no open attempt to save");
  const duration = quizDurationSeconds(quiz);
  if (
    (duration !== null && Date.now() >= attempt.startedAt.getTime() + duration * 1000) ||
    !isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart, undefined, quiz)
  )
    throw new QuizAuthoringError(409, "This attempt has expired. Submit your answers.");
  const attached = await db
    .select({ id: questions.id, questionType: questions.questionType })
    .from(quizQuestions)
    .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.sortOrder));
  const ids = attached.map((q) => q.id);
  const options = ids.length
    ? await db
        .select({ id: questionOptions.id, questionId: questionOptions.questionId })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, ids))
        .orderBy(asc(questionOptions.id))
    : [];
  if (
    input.answers.some(
      (a) =>
        !attached.some((q) => q.id === a.questionId) ||
        [a.selectedOptionId, ...(a.selectedOptionIds ?? [])].some(
          (optionId) =>
            optionId != null &&
            !options.some((o) => o.id === optionId && o.questionId === a.questionId),
        ),
    )
  )
    throw new QuizAuthoringError(422, "Answers must belong to this quiz", [
      { field: "answers", message: "Invalid question or option" },
    ]);
  const [saved] = await db
    .update(quizAttempts)
    .set({ draftAnswers: input.answers })
    .where(and(eq(quizAttempts.id, attempt.id), isNull(quizAttempts.submittedAt)))
    .returning({ id: quizAttempts.id });
  if (!saved)
    throw new QuizAuthoringError(409, "This attempt has already been submitted");
}
export async function quizAttemptReview(
  quizId: number,
  attemptId: number,
  auth: AuthContext,
): Promise<StudentQuizReview> {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.id, attemptId),
        eq(quizAttempts.quizId, quizId),
        eq(quizAttempts.userId, auth.userId),
      ),
    )
    .limit(1);
  if (
    !attempt ||
    !attempt.submittedAt ||
    attempt.userId !== auth.userId ||
    attempt.quizId !== quizId
  )
    throw new QuizAuthoringError(404, "Submitted attempt not found");
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!quiz) throw new QuizAuthoringError(404, "Quiz not found");
  const released = attempt.releasedAt !== null && attempt.score !== null;
  const showScore = released && quiz.showResultAfter !== "never";
  const result: StudentQuizReview = {
    title: quiz.title,
    status:
      attempt.score === null
        ? "awaiting_grading"
        : !released
          ? "held"
          : showScore
            ? "released"
            : "hidden",
    ...(showScore
      ? { score: Number(attempt.score), passed: Number(attempt.score) >= quiz.passMark }
      : {}),
    questions: [],
  };
  if (!(
    quiz.showAnswersAfter === "after_attempt" ||
    (quiz.showAnswersAfter === "after_release" && released)
  ))
    return result;
  const rows = await db
    .select({
      id: questions.id,
      bodyRichText: questions.bodyRichText,
      reasonRichText: questions.reasonRichText,
      questionType: questions.questionType,
      numericAnswer: questions.numericAnswer,
      numericTolerance: questions.numericTolerance,
      numericUnit: questions.numericUnit,
    })
    .from(quizQuestions)
    .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.sortOrder));
  const ids = rows.map((q) => q.id);
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
  const urls = await quizImageUrls(db, quizId, [
    ...rows.flatMap((q) => [q.bodyRichText, q.reasonRichText ?? ""]),
    ...options.map((o) => o.optionText),
  ]);
  result.questions = rows.map((q) => ({
    ...q,
    bodyRichText: resolveQuizRichText(q.bodyRichText, urls),
    reasonRichText: resolveQuizRichText(q.reasonRichText ?? "", urls),
    correctOptions: options
      .filter((o) => o.questionId === q.id && o.isCorrect)
      .map((o) => resolveQuizRichText(o.optionText, urls)),
    acceptedAnswers: blanks
      .filter((b) => b.questionId === q.id)
      .map((b) => b.acceptedAnswer),
  }));
  return result;
}
