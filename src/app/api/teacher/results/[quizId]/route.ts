import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import {
  courses,
  jambSubjects,
  quizAttempts,
  quizzes,
  users,
} from "@/lib/db/schema";

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One row per person who has submitted, carrying only what the held-score rule allows out. */
interface ResultAccumulator {
  userId: number;
  name: string;
  identifier: string;
  attempts: number;
  held: number;
  releasedScores: number[];
}

/**
 * GET /api/teacher/results/[quizId]
 *
 * Per-quiz performance for the Teacher who owns it: attempt/avg/pass-rate stats plus one
 * row per person who submitted.
 *
 * Held-score rule (DESIGN.md §4, Board decision 2026-09-17): a Teacher sees *that* an
 * attempt is pending release, never its score. Enforced here in the query itself — the
 * held select doesn't project `score` at all, so an unreleased mark is never read out of
 * the database, let alone returned. `avgScore` and `passRate` are therefore computed over
 * released attempts only, and are null (rendered "—") until something is released.
 *
 * Deviation from `.agents/design/screens-teacher.md` § `/teacher/results/[quizId]`, which
 * says a non-owned quiz answers 403: this returns 404 "Quiz not found", matching the
 * existing convention in `/api/teacher/quizzes/[id]` so the route doesn't confirm the
 * existence of another Teacher's quiz. Flagged in STATE.md.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { quizId: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid quiz id" } },
        { status: 400 },
      );
    }
    const db = getDb();

    const [quiz] = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        status: quizzes.status,
        passMark: quizzes.passMark,
        questionCount: quizzes.questionCount,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
        createdBy: quizzes.createdBy,
      })
      .from(quizzes)
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
      .where(eq(quizzes.id, id))
      .orderBy(asc(quizzes.id));

    if (!quiz || !forbiddenUnlessOwned(auth, quiz.createdBy)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    const releasedRows = await db
      .select({
        userId: quizAttempts.userId,
        fullName: users.fullName,
        identifier: users.identifier,
        score: quizAttempts.score,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(quizAttempts.userId, users.id))
      .where(
        and(
          eq(quizAttempts.quizId, id),
          isNotNull(quizAttempts.submittedAt),
          isNotNull(quizAttempts.releasedAt),
        ),
      )
      .orderBy(asc(users.fullName));

    // No `score` column in this projection — a held mark is never read, by construction.
    const heldRows = await db
      .select({
        userId: quizAttempts.userId,
        fullName: users.fullName,
        identifier: users.identifier,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(quizAttempts.userId, users.id))
      .where(
        and(
          eq(quizAttempts.quizId, id),
          isNotNull(quizAttempts.submittedAt),
          isNull(quizAttempts.releasedAt),
        ),
      )
      .orderBy(asc(users.fullName));

    const byUser = new Map<number, ResultAccumulator>();
    const accumulatorFor = (
      userId: number,
      name: string,
      identifier: string,
    ): ResultAccumulator => {
      const existing = byUser.get(userId);
      if (existing) return existing;
      const created: ResultAccumulator = {
        userId,
        name,
        identifier,
        attempts: 0,
        held: 0,
        releasedScores: [],
      };
      byUser.set(userId, created);
      return created;
    };

    const releasedScores: number[] = [];
    for (const row of releasedRows) {
      const acc = accumulatorFor(row.userId, row.fullName, row.identifier);
      acc.attempts += 1;
      // A submitted attempt always carries a score (grading runs synchronously on submit);
      // the guard is for a NULL that predates that rule, and it must not drop the row.
      const score = row.score === null ? Number.NaN : Number(row.score);
      if (!Number.isFinite(score)) continue;
      acc.releasedScores.push(score);
      releasedScores.push(score);
    }
    for (const row of heldRows) {
      const acc = accumulatorFor(row.userId, row.fullName, row.identifier);
      acc.attempts += 1;
      acc.held += 1;
    }

    const data = [...byUser.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((acc) => ({
        userId: acc.userId,
        name: acc.name,
        identifier: acc.identifier,
        attempts: acc.attempts,
        held: acc.held,
        bestScore: acc.releasedScores.length > 0 ? Math.max(...acc.releasedScores) : null,
      }));

    const releasedCount = releasedRows.length;
    const passedCount = releasedScores.filter((score) => score >= quiz.passMark).length;

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        quizType: quiz.quizType,
        weekStart: quiz.weekStart,
        status: quiz.status,
        passMark: quiz.passMark,
        questionCount: quiz.questionCount,
        courseCode: quiz.courseCode,
        subjectName: quiz.subjectName,
      },
      stats: {
        attempts: releasedCount + heldRows.length,
        releasedAttempts: releasedCount,
        heldAttempts: heldRows.length,
        // Both rate stats are over released attempts only — a held score is not known here.
        avgScore:
          releasedScores.length > 0
            ? round2(releasedScores.reduce((sum, s) => sum + s, 0) / releasedScores.length)
            : null,
        passRate:
          releasedScores.length > 0
            ? round2((passedCount / releasedScores.length) * 100)
            : null,
      },
      data,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
