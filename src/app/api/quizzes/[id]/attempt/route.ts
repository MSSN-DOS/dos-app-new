import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  questionBlanks,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
  quizzes,
  roles,
} from "@/lib/db/schema";
import { attemptAnswers } from "@/lib/db/schema/quizzes";
import { bestScores } from "@/lib/db/schema/performance";
import { errorResponse } from "@/lib/api/response";
import { submitAttemptSchema } from "@/lib/validation/attempts";
import { studentCanAccessQuiz } from "@/lib/quizzes/access";
import { isCourseQuizWindowOpen } from "@/lib/quizzes/window";
import {
  gradeAttempt,
  type GradingQuestion,
  type SubmittedAnswer,
} from "@/lib/scoring/grade-attempt";

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

async function autoSubmitStaleAttempt(
  db: ReturnType<typeof getDb>,
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
  const [row] = await db
    .update(quizAttempts)
    .set({ score: result.score.toFixed(2), submittedAt: new Date() })
    .where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.submittedAt)))
    .returning({ id: quizAttempts.id });
  if (!row) return false;
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
  if (attemptAnswerValues.length > 0) await db.insert(attemptAnswers).values(attemptAnswerValues);
  const [existingBest] = await db
    .select({ bestScore: bestScores.bestScore })
    .from(bestScores)
    .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)))
    .limit(1);
  if (!existingBest) {
    await db
      .insert(bestScores)
      .values({ userId, quizId, bestScore: result.score.toFixed(2), achievedAt: new Date() });
  } else if (result.score > Number(existingBest.bestScore)) {
    await db
      .update(bestScores)
      .set({ bestScore: result.score.toFixed(2), achievedAt: new Date() })
      .where(and(eq(bestScores.userId, userId), eq(bestScores.quizId, quizId)));
  }
  return true;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    const db = getDb();
    const { id } = await params;
    const quizId = Number(id);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 }
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
        instructions: quizzes.instructions,
        status: quizzes.status,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        questionCount: quizzes.questionCount,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        allowMultipleAttempts: quizzes.allowMultipleAttempts,
        loseFocusPolicy: quizzes.loseFocusPolicy,
        courseId: quizzes.courseId,
        jambSubjectId: quizzes.jambSubjectId,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);
    if (!quiz || quiz.status !== "published") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 }
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
          { status: 403 }
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
        { status: 403 }
      );
    }

    let priorRows = await db
      .select({
        id: quizAttempts.id,
        attemptNumber: quizAttempts.attemptNumber,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)))
      .orderBy(asc(quizAttempts.id));
    let openAttempt = priorRows.find((attempt) => attempt.submittedAt === null) ?? null;
    let completedCount = priorRows.filter((attempt) => attempt.submittedAt !== null).length;

    // Auto-submit stale open attempt on expiry (time limit or window closed)
    // so single-attempt users aren't permanently locked out.
    if (openAttempt) {
      const expiresAt = openAttempt.startedAt.getTime() + quiz.timeLimitMinutes * 60_000;
      const timeExpired = Date.now() > expiresAt;
      const windowExpired = !isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart);
      if (timeExpired || windowExpired) {
        const stale = await autoSubmitStaleAttempt(db, openAttempt.id, quizId, auth.userId);
        if (stale) {
          priorRows = await db
            .select({
              id: quizAttempts.id,
              attemptNumber: quizAttempts.attemptNumber,
              startedAt: quizAttempts.startedAt,
              submittedAt: quizAttempts.submittedAt,
            })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)))
            .orderBy(asc(quizAttempts.id));
          openAttempt = null;
          completedCount = priorRows.filter((a) => a.submittedAt !== null).length;
        }
      }
    }
    // Enforce course-quiz window for starting (or restarting) an attempt.
    if (!openAttempt && !isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart)) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This Course Quiz is outside its Saturday-Sunday window",
          },
        },
        { status: 409 }
      );
    }
    if (!openAttempt && !quiz.allowMultipleAttempts && completedCount > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "You have already attempted this quiz",
          },
        },
        { status: 409 }
      );
    }

    const attempt = openAttempt
      ? openAttempt
      : (
          await db
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
            })
        )[0];

    const attachedRows = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        bodyRichText: questions.bodyRichText,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(questions.id));
    const questionRows = quiz.allowMultipleAttempts
      ? shuffleForAttempt(attachedRows, attempt.id)
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

    return NextResponse.json({
      data: {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        title: quiz.title,
        instructions: quiz.instructions,
        startedAt: attempt.startedAt.toISOString(),
        timeLimitMinutes: quiz.timeLimitMinutes,
        allowMultipleAttempts: quiz.allowMultipleAttempts,
        loseFocusPolicy: quiz.loseFocusPolicy,
        questions: questionRows.map((question) => ({
          id: question.id,
          questionType: question.questionType,
          bodyRichText: question.bodyRichText,
          options: optionRows
            .filter((option) => option.questionId === question.id)
            .map(({ id: optionId, optionText }) => ({ id: optionId, optionText })),
          blankIndexes: blankRows
            .filter((blank) => blank.questionId === question.id)
            .map((blank) => blank.blankIndex),
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    const db = getDb();

    const { id } = await params;
    const quizId = Number(id);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 }
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
        { status: 422 }
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
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        courseId: quizzes.courseId,
        jambSubjectId: quizzes.jambSubjectId,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);
    if (!quiz || quiz.status !== "published") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 }
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
          { status: 403 }
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
          { status: 403 }
        );
      }
    }

    const priorRows = await db
      .select({
        id: quizAttempts.id,
        attemptNumber: quizAttempts.attemptNumber,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, auth.userId)))
      .orderBy(asc(quizAttempts.id));
    const openAttempt = priorRows.find((attempt) => attempt.submittedAt === null);
    const completedCount = priorRows.filter((attempt) => attempt.submittedAt !== null).length;
    if (!openAttempt && !quiz.allowMultipleAttempts && completedCount > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "You have already attempted this quiz",
          },
        },
        { status: 409 }
      );
    }
    if (!openAttempt) {
      // Enforce window for starting a submission without an open attempt.
      if (!isCourseQuizWindowOpen(quiz.quizType, quiz.weekStart)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "This Course Quiz is outside its Saturday-Sunday window",
            },
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Start the quiz before submitting it",
          },
        },
        { status: 409 }
      );
    }
    // Expired attempts are auto-submitted (grade whatever answers were sent)
    // rather than dead-locking the user with a 409.

    const attachedRows = await db
      .select({ id: questions.id, questionType: questions.questionType })
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

    const gradingQuestions: GradingQuestion[] = attachedRows.map((row) => ({
      id: row.id,
      questionType: row.questionType,
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
    const submittedAnswers: SubmittedAnswer[] = [];
    for (const answer of parsed.data.answers) {
      if (!attachedSet.has(answer.questionId)) continue;
      const blankAnswers: Record<number, string> = {};
      if (answer.blankAnswers) {
        for (const [index, text] of Object.entries(answer.blankAnswers)) {
          blankAnswers[Number(index)] = text;
        }
      }
      submittedAnswers.push({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId ?? null,
        blankAnswers,
      });
    }

    const result = gradeAttempt(gradingQuestions, submittedAnswers);

    const [attemptRow] = await db
      .update(quizAttempts)
      .set({
        score: result.score.toFixed(2),
        submittedAt: new Date(),
      })
      .where(and(eq(quizAttempts.id, openAttempt.id), isNull(quizAttempts.submittedAt)))
      .returning({ id: quizAttempts.id });
    if (!attemptRow) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This quiz attempt was already submitted",
          },
        },
        { status: 409 }
      );
    }

    const attemptAnswerValues: (typeof attemptAnswers.$inferInsert)[] = [];
    gradingQuestions.forEach((question, i) => {
      const answer = submittedAnswers.find((a) => a.questionId === question.id);
      const verdict = result.results[i];
      if (question.questionType === "options") {
        attemptAnswerValues.push({
          attemptId: attemptRow.id,
          questionId: question.id,
          selectedOptionId: answer?.selectedOptionId ?? null,
          textAnswer: null,
          blankIndex: null,
          isCorrect: verdict.isCorrect,
        });
        return;
      }
      question.blanks.forEach((blank) => {
        const submitted = answer?.blankAnswers[blank.blankIndex] ?? null;
        attemptAnswerValues.push({
          attemptId: attemptRow.id,
          questionId: question.id,
          selectedOptionId: null,
          textAnswer: submitted,
          blankIndex: blank.blankIndex,
          isCorrect:
            submitted !== null && normalize(blank.acceptedAnswer) === normalize(submitted),
        });
      });
    });
    if (attemptAnswerValues.length > 0) {
      await db.insert(attemptAnswers).values(attemptAnswerValues);
    }

    // Best score upsert — only ever raised, never lowered.
    const [existingBest] = await db
      .select({ bestScore: bestScores.bestScore })
      .from(bestScores)
      .where(and(eq(bestScores.userId, auth.userId), eq(bestScores.quizId, quizId)))
      .limit(1);
    if (!existingBest) {
      await db.insert(bestScores).values({
        userId: auth.userId,
        quizId,
        bestScore: result.score.toFixed(2),
        achievedAt: new Date(),
      });
    } else if (result.score > Number(existingBest.bestScore)) {
      await db
        .update(bestScores)
        .set({ bestScore: result.score.toFixed(2), achievedAt: new Date() })
        .where(and(eq(bestScores.userId, auth.userId), eq(bestScores.quizId, quizId)));
    }

    // Held-score rule (DESIGN.md §4): never return the numeric score here.
    return NextResponse.json(
      {
        data: {
          attemptId: attemptRow.id,
          scoreStatus: "held" as const,
          message: "Submitted. Your score will appear once released.",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
