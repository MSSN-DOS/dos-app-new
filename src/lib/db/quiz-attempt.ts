import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  questionBlanks,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
  quizzes,
  roles,
  passages,
} from "@/lib/db/schema";
import { attemptAnswers } from "@/lib/db/schema/quizzes";
import { bestScores } from "@/lib/db/schema/performance";
import { submitAttemptSchema } from "@/lib/validation/attempts";
import { studentCanAccessQuiz } from "@/lib/quizzes/access";
import { isCourseQuizWindowOpen } from "@/lib/quizzes/window";
import {
  gradeWeightedAttempt,
  type WeightedGradeResult,
  type WeightedGradingQuestion,
  type WeightedSubmittedAnswer,
} from "@/lib/scoring/weighted-attempt";
import { quizGradingQuestions } from "@/lib/db/quiz-grading";
import { QuizAuthoringError, quizAuthoringErrorResponse } from "@/lib/api/quiz-authoring";
import { quizImageUrls } from "@/lib/db/quiz-image-urls";
import { resolveQuizRichText } from "@/lib/quizzes/images";
import { hasAttemptRemaining } from "@/lib/quizzes/attempt-limit";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function shuffleForAttempt<T extends { id: number }>(rows: T[], attemptId: number): T[] {
  const shuffled = [...rows];
  let seed = attemptId;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffleQuestionBlocks<T extends { id: number; passageId?: number | null }>(
  rows: T[],
  attemptId: number,
): T[] {
  const grouped: { id: number; rows: T[] }[] = [];
  const seen = new Set<number>();
  rows.forEach((row) => {
    if (row.passageId) {
      if (seen.has(row.passageId)) return;
      seen.add(row.passageId);
      grouped.push({
        id: row.id,
        rows: rows.filter((q) => q.passageId === row.passageId),
      });
    } else grouped.push({ id: row.id, rows: [row] });
  });
  return shuffleForAttempt(grouped, attemptId).flatMap((block) => block.rows);
}

type AttemptDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;
function fromStoredAnswers(
  rows: (typeof quizAttempts.$inferSelect)["draftAnswers"],
): WeightedSubmittedAnswer[] {
  return (rows ?? []).map((a) => ({
    questionId: a.questionId,
    selectedOptionId: a.selectedOptionId ?? null,
    selectedOptionIds: a.selectedOptionIds ?? [],
    numericAnswer: a.numericAnswer ?? null,
    blankAnswers: a.blankAnswers ?? {},
    essayAnswer: a.essayAnswer ?? null,
  }));
}
async function persistAttemptOutcome(
  db: AttemptDb,
  attemptId: number,
  quizId: number,
  userId: number,
  gradingQuestions: WeightedGradingQuestion[],
  submitted: WeightedSubmittedAnswer[],
  result: WeightedGradeResult,
): Promise<boolean> {
  const [row] = await db
    .update(quizAttempts)
    .set({
      score: result.score?.toFixed(2) ?? null,
      submittedAt: new Date(),
      draftAnswers: [],
    })
    .where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.submittedAt)))
    .returning({ id: quizAttempts.id });
  if (!row) return false;
  const values: (typeof attemptAnswers.$inferInsert)[] = [];
  gradingQuestions.forEach((q, index) => {
    const a = submitted.find((s) => s.questionId === q.id);
    const verdict = result.results[index];
    if (q.questionType !== "fill_in_gap") {
      values.push({
        attemptId: row.id,
        questionId: q.id,
        selectedOptionId:
          q.questionType === "options" ? (a?.selectedOptionId ?? null) : null,
        selectedOptionIds:
          q.questionType === "multi_answer" ? (a?.selectedOptionIds ?? []) : null,
        textAnswer:
          q.questionType === "essay"
            ? (a?.essayAnswer ?? "")
            : q.questionType === "numeric"
              ? (a?.numericAnswer ?? "")
              : null,
        blankIndex: null,
        isCorrect: verdict.isCorrect,
        awardedMarks: verdict.awardedMarks,
      });
    } else
      q.blanks.forEach((blank, blankIndex) => {
        const text = a?.blankAnswers[blank.blankIndex] ?? null;
        values.push({
          attemptId: row.id,
          questionId: q.id,
          selectedOptionId: null,
          textAnswer: text,
          blankIndex: blank.blankIndex,
          isCorrect: text !== null && normalize(text) === normalize(blank.acceptedAnswer),
          awardedMarks: blankIndex === 0 ? verdict.awardedMarks : null,
        });
      });
  });
  if (values.length) await db.insert(attemptAnswers).values(values);
  if (result.score !== null) {
    const [best] = await db
      .select({ bestScore: bestScores.bestScore })
      .from(bestScores)
      .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)))
      .limit(1);
    if (!best)
      await db.insert(bestScores).values({
        userId,
        quizId,
        bestScore: result.score.toFixed(2),
        achievedAt: new Date(),
      });
    else if (result.score > Number(best.bestScore))
      await db
        .update(bestScores)
        .set({ bestScore: result.score.toFixed(2), achievedAt: new Date() })
        .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)));
  }
  return true;
}
async function autoSubmitStaleAttempt(
  db: ReturnType<typeof getDb>,
  attemptId: number,
  quizId: number,
  userId: number,
  saved: (typeof quizAttempts.$inferSelect)["draftAnswers"] = [],
  deductWrong = false,
): Promise<boolean> {
  const gradingQuestions = await quizGradingQuestions(db, quizId);
  const submitted = fromStoredAnswers(saved);
  const result = gradeWeightedAttempt(gradingQuestions, submitted, deductWrong);
  return db.transaction((tx) =>
    persistAttemptOutcome(
      tx,
      attemptId,
      quizId,
      userId,
      gradingQuestions,
      submitted,
      result,
    ),
  );
}

export async function getQuizAttempt(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  auth: AuthContext,
) {
  try {
    const db = getDb();
    const { id } = await params;
    const quizId = Number(id);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    const [roleRow] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, auth.roleId))
      .orderBy(asc(roles.id))
      .limit(1);
    const roleName = roleRow?.name ?? "";

    const [quiz] = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        description: quizzes.description,
        coverImagePath: quizzes.coverImagePath,
        passMark: quizzes.passMark,
        instructions: quizzes.instructions,
        status: quizzes.status,
        unpublishedAt: quizzes.unpublishedAt,
        maxAttempts: quizzes.maxAttempts,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        opensAt: quizzes.opensAt,
        closesAt: quizzes.closesAt,
        questionCount: quizzes.questionCount,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        timeLimitSeconds: quizzes.timeLimitSeconds,
        scheduleEnabled: quizzes.scheduleEnabled,
        allowResume: quizzes.allowResume,
        shuffleQuestions: quizzes.shuffleQuestions,
        shuffleOptions: quizzes.shuffleOptions,
        autoNextQuestion: quizzes.autoNextQuestion,
        showCalculator: quizzes.showCalculator,
        deductMarksForWrong: quizzes.deductMarksForWrong,
        allowMultipleAttempts: quizzes.allowMultipleAttempts,
        loseFocusPolicy: quizzes.loseFocusPolicy,
        courseId: quizzes.courseId,
        jambSubjectId: quizzes.jambSubjectId,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);
    if (!quiz || (quiz.status !== "published" && !quiz.unpublishedAt)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    if (roleName === "aspirant") {
      if (quiz.jambSubjectId === null) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "This quiz is not available to aspirants",
            },
          },
          { status: 403 },
        );
      }
    } else if (!(await studentCanAccessQuiz(db, auth.userId, quiz))) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "This quiz is not available to you",
          },
        },
        { status: 403 },
      );
    }

    let priorRows = await db
      .select({
        id: quizAttempts.id,
        attemptNumber: quizAttempts.attemptNumber,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        draftAnswers: quizAttempts.draftAnswers,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)))
      .orderBy(asc(quizAttempts.id));
    let openAttempt = priorRows.find((attempt) => attempt.submittedAt === null) ?? null;
    let completedCount = priorRows.filter(
      (attempt) => attempt.submittedAt !== null,
    ).length;
    if (quiz.status !== "published" && !openAttempt)
      throw new QuizAuthoringError(404, "Quiz not found");

    // Auto-submit stale open attempt on expiry (time limit or window closed)
    // so single-attempt users aren't permanently locked out.
    if (openAttempt) {
      const duration =
        quiz.timeLimitSeconds === undefined
          ? quiz.timeLimitMinutes == null
            ? null
            : quiz.timeLimitMinutes * 60
          : quiz.timeLimitSeconds;
      const timeExpired =
        duration !== null &&
        Date.now() > openAttempt.startedAt.getTime() + duration * 1000;
      const windowExpired = !isCourseQuizWindowOpen(
        quiz.quizType,
        quiz.weekStart,
        undefined,
        {
          opensAt: quiz.opensAt,
          closesAt: quiz.closesAt,
          scheduleEnabled: quiz.scheduleEnabled,
        },
      );
      if (timeExpired || windowExpired || quiz.allowResume === false) {
        const stale = await autoSubmitStaleAttempt(
          db,
          openAttempt.id,
          quizId,
          auth.userId,
          openAttempt.draftAnswers,
          quiz.deductMarksForWrong,
        );
        if (stale) {
          priorRows = await db
            .select({
              id: quizAttempts.id,
              attemptNumber: quizAttempts.attemptNumber,
              startedAt: quizAttempts.startedAt,
              submittedAt: quizAttempts.submittedAt,
              draftAnswers: quizAttempts.draftAnswers,
            })
            .from(quizAttempts)
            .where(
              and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)),
            )
            .orderBy(asc(quizAttempts.id));
          openAttempt = null;
          completedCount = priorRows.filter((a) => a.submittedAt !== null).length;
        }
      }
    }
    // Enforce course-quiz window for starting (or restarting) an attempt.
    if (
      !openAttempt &&
      !isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart, undefined, {
        opensAt: quiz.opensAt,
        closesAt: quiz.closesAt,
        scheduleEnabled: quiz.scheduleEnabled,
      })
    ) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message:
              quiz.opensAt || quiz.closesAt
                ? "This Course Quiz is outside the availability window set by an admin"
                : "This Course Quiz is outside its Saturday-Sunday window",
          },
        },
        { status: 409 },
      );
    }
    if (!openAttempt && !hasAttemptRemaining(quiz, completedCount)) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "You have already attempted this quiz",
          },
        },
        { status: 409 },
      );
    }

    const attempt = openAttempt
      ? openAttempt
      : await db.transaction(async (tx) => {
          // Locks the quiz row against unpublish/content writes before starting.
          const [locked] = await tx
            .update(quizzes)
            .set({ attemptsStarted: true })
            .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "published")))
            .returning({ id: quizzes.id });
          if (!locked)
            throw new QuizAuthoringError(
              409,
              "This quiz is no longer available for new attempts",
            );
          const [started] = await tx
            .insert(quizAttempts)
            .values({
              quizId,
              userId: auth.userId,
              attemptNumber: completedCount + 1,
              score: null,
              startedAt: new Date(),
              submittedAt: null,
              releasedAt: null,
            })
            .returning({
              id: quizAttempts.id,
              attemptNumber: quizAttempts.attemptNumber,
              startedAt: quizAttempts.startedAt,
            });
          return started;
        });

    const attachedRows = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        numericUnit: questions.numericUnit,
        shuffleOptions: questions.shuffleOptions,
        bodyRichText: questions.bodyRichText,
        passageId: questions.passageId,
        marks: quizQuestions.marks,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.sortOrder), asc(questions.id));
    const questionRows =
      (quiz.shuffleQuestions ?? quiz.allowMultipleAttempts)
        ? shuffleQuestionBlocks(attachedRows, attempt.id)
        : attachedRows;
    const attachedIds = questionRows.map((question) => question.id);
    const optionRows =
      attachedIds.length > 0
        ? await db
            .select({
              id: questionOptions.id,
              questionId: questionOptions.questionId,
              optionText: questionOptions.optionText,
              sortOrder: questionOptions.sortOrder,
            })
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, attachedIds))
            .orderBy(asc(questionOptions.sortOrder))
        : [];
    const blankRows =
      attachedIds.length > 0
        ? await db
            .select({
              questionId: questionBlanks.questionId,
              blankIndex: questionBlanks.blankIndex,
            })
            .from(questionBlanks)
            .where(inArray(questionBlanks.questionId, attachedIds))
            .orderBy(asc(questionBlanks.blankIndex))
        : [];

    const passageIds = questionRows.flatMap((q) => (q.passageId ? [q.passageId] : []));
    const passageRows = passageIds.length
      ? await db
          .select({
            id: passages.id,
            title: passages.title,
            bodyRichText: passages.bodyRichText,
          })
          .from(passages)
          .where(inArray(passages.id, passageIds))
          .orderBy(asc(passages.id))
      : [];
    const urls = await quizImageUrls(
      db,
      quizId,
      [
        quiz.instructions ?? "",
        quiz.description ?? "",
        ...questionRows.map((q) => q.bodyRichText),
        ...optionRows.map((o) => o.optionText),
        ...passageRows.map((p) => p.bodyRichText),
      ],
      quiz.coverImagePath,
    );
    return NextResponse.json({
      data: {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        title: quiz.title,
        instructions: resolveQuizRichText(quiz.instructions ?? "", urls),
        description: resolveQuizRichText(quiz.description ?? "", urls),
        coverImageUrl: quiz.coverImagePath
          ? (urls.get(quiz.coverImagePath) ?? null)
          : null,
        durationSeconds:
          quiz.timeLimitSeconds === undefined
            ? quiz.timeLimitMinutes == null
              ? null
              : quiz.timeLimitMinutes * 60
            : quiz.timeLimitSeconds,
        savedAnswers: openAttempt?.draftAnswers ?? [],
        allowResume: quiz.allowResume ?? true,
        autoNextQuestion: quiz.autoNextQuestion ?? false,
        showCalculator: quiz.showCalculator ?? false,
        deductMarksForWrong: quiz.deductMarksForWrong ?? false,
        startedAt: attempt.startedAt.toISOString(),
        timeLimitMinutes: quiz.timeLimitMinutes,
        allowMultipleAttempts: quiz.allowMultipleAttempts,
        loseFocusPolicy: quiz.loseFocusPolicy,
        questions: questionRows.map((question) => ({
          id: question.id,
          questionType: question.questionType,
          numericUnit: question.numericUnit ?? "",
          bodyRichText: resolveQuizRichText(question.bodyRichText, urls),
          marks: question.marks ?? 1,
          passage: question.passageId
            ? (() => {
                const p = passageRows.find((p) => p.id === question.passageId);
                return p
                  ? {
                      id: p.id,
                      title: p.title,
                      bodyRichText: resolveQuizRichText(p.bodyRichText, urls),
                    }
                  : null;
              })()
            : null,
          options: (quiz.shuffleOptions || question.shuffleOptions
            ? shuffleForAttempt(
                optionRows.filter((option) => option.questionId === question.id),
                attempt.id + question.id,
              )
            : optionRows.filter((option) => option.questionId === question.id)
          ).map(({ id: optionId, optionText }) => ({
            id: optionId,
            optionText: resolveQuizRichText(optionText, urls),
          })),
          blankIndexes: blankRows
            .filter((blank) => blank.questionId === question.id)
            .map((blank) => blank.blankIndex),
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return quizAuthoringErrorResponse(error);
  }
}

export async function submitQuizAttempt(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  auth: AuthContext,
) {
  try {
    const db = getDb();

    const { id } = await params;
    const quizId = Number(id);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = submitAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid submission",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            })),
          },
        },
        { status: 422 },
      );
    }

    const [roleRow] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, auth.roleId))
      .orderBy(asc(roles.id))
      .limit(1);
    const roleName = roleRow?.name ?? "";

    const [quiz] = await db
      .select({
        id: quizzes.id,
        status: quizzes.status,
        allowMultipleAttempts: quizzes.allowMultipleAttempts,
        unpublishedAt: quizzes.unpublishedAt,
        maxAttempts: quizzes.maxAttempts,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        opensAt: quizzes.opensAt,
        closesAt: quizzes.closesAt,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        timeLimitSeconds: quizzes.timeLimitSeconds,
        scheduleEnabled: quizzes.scheduleEnabled,
        allowResume: quizzes.allowResume,
        shuffleQuestions: quizzes.shuffleQuestions,
        shuffleOptions: quizzes.shuffleOptions,
        autoNextQuestion: quizzes.autoNextQuestion,
        showCalculator: quizzes.showCalculator,
        deductMarksForWrong: quizzes.deductMarksForWrong,
        courseId: quizzes.courseId,
        jambSubjectId: quizzes.jambSubjectId,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);
    if (!quiz || (quiz.status !== "published" && !quiz.unpublishedAt)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    if (roleName === "aspirant") {
      if (quiz.jambSubjectId === null) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "This quiz is not available to aspirants",
            },
          },
          { status: 403 },
        );
      }
    } else {
      const canAccess = await studentCanAccessQuiz(db, auth.userId, quiz);
      if (!canAccess) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "This quiz is not available to you",
            },
          },
          { status: 403 },
        );
      }
    }

    const priorRows = await db
      .select({
        id: quizAttempts.id,
        attemptNumber: quizAttempts.attemptNumber,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        draftAnswers: quizAttempts.draftAnswers,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)))
      .orderBy(asc(quizAttempts.id));
    const openAttempt = priorRows.find((attempt) => attempt.submittedAt === null);
    if (quiz.status !== "published" && !openAttempt)
      throw new QuizAuthoringError(404, "Quiz not found");
    const completedCount = priorRows.filter(
      (attempt) => attempt.submittedAt !== null,
    ).length;
    if (!openAttempt && !hasAttemptRemaining(quiz, completedCount)) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "You have already attempted this quiz",
          },
        },
        { status: 409 },
      );
    }
    if (!openAttempt) {
      // Enforce window for starting a submission without an open attempt.
      if (
        !isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart, undefined, {
          opensAt: quiz.opensAt,
          closesAt: quiz.closesAt,
          scheduleEnabled: quiz.scheduleEnabled,
        })
      ) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "This Course Quiz is outside its Saturday-Sunday window",
            },
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Start the quiz before submitting it",
          },
        },
        { status: 409 },
      );
    }
    // Expired attempts are auto-submitted (grade whatever answers were sent)
    // rather than dead-locking the user with a 409.

    const attachedRows = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        marks: quizQuestions.marks,
        numericAnswer: questions.numericAnswer,
        numericTolerance: questions.numericTolerance,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(questions.id));

    const attachedIds = attachedRows.map((row) => row.id);

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

    const gradingQuestions: WeightedGradingQuestion[] = attachedRows.map((row) => ({
      id: row.id,
      questionType: row.questionType,
      numericAnswer: row.numericAnswer,
      numericTolerance: row.numericTolerance,
      marks: row.marks ?? 1,
      options: optionRows
        .filter((option) => option.questionId === row.id)
        .map((option) => ({ id: option.id, isCorrect: option.isCorrect ?? false }))
        .sort((a, b) => a.id - b.id),
      blanks: blankRows
        .filter((blank) => blank.questionId === row.id)
        .map((blank) => ({
          blankIndex: blank.blankIndex,
          acceptedAnswer: blank.acceptedAnswer,
        }))
        .sort((a, b) => (a.blankIndex ?? 0) - (b.blankIndex ?? 0)),
    }));

    // Only grade answers for actually-attached questions; ignore anything else.
    const attachedSet = new Set(attachedIds);
    const submittedAnswers: WeightedSubmittedAnswer[] = [];
    for (const answer of parsed.data.answers) {
      if (!attachedSet.has(answer.questionId)) continue;
      const blankAnswers: Record<number, string> = {};
      if (answer.blankAnswers) {
        for (const [index, text] of Object.entries(answer.blankAnswers)) {
          blankAnswers[Number(index)] = text;
        }
      }
      const gradingQuestion = gradingQuestions.find((q) => q.id === answer.questionId);
      if (
        gradingQuestion?.questionType === "options" &&
        answer.selectedOptionId != null &&
        !gradingQuestion.options.some((o) => o.id === answer.selectedOptionId)
      ) {
        throw new QuizAuthoringError(422, "Choose an option belonging to its question", [
          { field: "answers", message: "An answer option belongs to another question" },
        ]);
      }
      if (
        answer.selectedOptionIds?.some(
          (id) => !gradingQuestion?.options.some((o) => o.id === id),
        )
      )
        throw new QuizAuthoringError(422, "Choose options belonging to their question", [
          { field: "answers", message: "An answer option belongs to another question" },
        ]);
      submittedAnswers.push({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId ?? null,
        selectedOptionIds: answer.selectedOptionIds ?? [],
        numericAnswer: answer.numericAnswer ?? null,
        blankAnswers,
        essayAnswer: answer.essayAnswer ?? null,
      });
    }

    const result = gradeWeightedAttempt(
      gradingQuestions,
      submittedAnswers,
      quiz.deductMarksForWrong,
    );
    const finalized = await db.transaction((tx) =>
      persistAttemptOutcome(
        tx,
        openAttempt.id,
        quizId,
        auth.userId,
        gradingQuestions,
        submittedAnswers,
        result,
      ),
    );
    if (!finalized)
      return NextResponse.json(
        {
          error: { code: "CONFLICT", message: "This quiz attempt was already submitted" },
        },
        { status: 409 },
      );

    // Held-score rule (DESIGN.md §4): never return the numeric score here.
    return NextResponse.json(
      {
        data: {
          attemptId: openAttempt.id,
          scoreStatus: result.pendingManual
            ? ("awaiting_grading" as const)
            : ("held" as const),
          message: result.pendingManual
            ? "Submitted. Your teacher will grade the essays before an Admin releases your result."
            : "Submitted. Your score will appear once released.",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return quizAuthoringErrorResponse(error);
  }
}
