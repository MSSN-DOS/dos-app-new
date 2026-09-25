import { and, asc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { courses, jambSubjects, quizAttempts, quizzes } from "@/lib/db/schema";

/**
 * GET /api/teacher/results
 *
 * The caller's quizzes that have at least one submitted attempt, with released/held
 * tallies so a Teacher can pick which quiz to open. Quizzes nobody has attempted yet
 * are omitted — this is a results screen, not the quiz list (`/teacher/quizzes`).
 *
 * Teachers see only their own quizzes; admins bypass ownership entirely
 * (`ownershipScope`), matching every other `/api/teacher/*` route.
 *
 * Tallies are counts, never scores, so nothing held can leak through this route.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const db = getDb();
    const owner = ownershipScope(auth);

    const quizBase = db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        status: quizzes.status,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
      })
      .from(quizzes)
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id));

    const quizRows =
      owner !== null
        ? await quizBase.where(eq(quizzes.createdBy, owner)).orderBy(asc(quizzes.id))
        : await quizBase.orderBy(asc(quizzes.id));

    const attemptConds = [isNotNull(quizAttempts.submittedAt)];
    if (owner !== null) attemptConds.push(eq(quizzes.createdBy, owner));

    // Flat rows counted in JS rather than a GROUP BY — same approach as the
    // published-quiz counts on /api/admin/teachers.
    const attemptRows = await db
      .select({
        quizId: quizAttempts.quizId,
        releasedAt: quizAttempts.releasedAt,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(and(...attemptConds))
      .orderBy(asc(quizAttempts.quizId));

    const tallies = new Map<number, { attempts: number; released: number; held: number }>();
    for (const row of attemptRows) {
      const tally = tallies.get(row.quizId) ?? { attempts: 0, released: 0, held: 0 };
      tally.attempts += 1;
      if (row.releasedAt === null) tally.held += 1;
      else tally.released += 1;
      tallies.set(row.quizId, tally);
    }

    const data = quizRows.flatMap((quiz) => {
      const tally = tallies.get(quiz.id);
      if (!tally) return [];
      return [
        {
          quizId: quiz.id,
          title: quiz.title,
          quizType: quiz.quizType,
          weekStart: quiz.weekStart,
          status: quiz.status,
          courseCode: quiz.courseCode,
          subjectName: quiz.subjectName,
          ...tally,
        },
      ];
    });

    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
