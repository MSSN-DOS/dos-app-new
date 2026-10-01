import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { courses, jambSubjects, quizAttempts, quizzes } from "@/lib/db/schema";
import { heldQuerySchema } from "@/lib/validation/scores";

/** GET /api/admin/scores/held?week=YYYY-MM-DD — held attempts grouped per quiz. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const query = heldQuerySchema.safeParse({
      week: new URL(request.url).searchParams.get("week") ?? undefined,
    });
    if (!query.success) return errorResponse(query.error, "query");
    const week = query.data.week;

    const rows = await db
      .select({
        quizId: quizAttempts.quizId,
        title: quizzes.title,
        quizType: quizzes.quizType,
        weekStart: quizzes.weekStart,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
      // No `isNotNull(quizzes.weekStart)` here, and that omission is deliberate. Every submission
      // is held until an Admin releases it — Topic Quiz submissions included — but Topic Quizzes
      // have a NULL `weekStart` by design (they are not weekly), so the previous filter dropped
      // every Topic Quiz row. The result was Topic Quiz scores held forever with no way to release
      // them: the per-quiz release endpoint would have accepted one, but the Admin could never find
      // the quizId because this list omitted it. Filtering by an explicit `week` below still
      // excludes them, because `week_start = '…'` never matches NULL.
      .where(
        and(
          isNotNull(quizAttempts.submittedAt),
          isNull(quizAttempts.releasedAt),
          ...(week ? [eq(quizzes.weekStart, week)] : []),
        ),
      )
      .orderBy(asc(quizzes.weekStart), asc(quizAttempts.quizId));

    // Count held attempts per quiz in JS — no GROUP BY at this scale.
    const byQuiz = new Map<
      number,
      {
        quizId: number;
        label: string;
        // Sent to the client so the Admin's list can label a Topic Quiz as one instead of
        // guessing from the absent subject name.
        quizType: string;
        weekStart: string | null;
        courseCode: string | null;
        subjectName: string | null;
        heldCount: number;
      }
    >();
    for (const row of rows) {
      const existing = byQuiz.get(row.quizId);
      if (existing) {
        existing.heldCount += 1;
      } else {
        byQuiz.set(row.quizId, {
          quizId: row.quizId,
          label: row.title,
          quizType: row.quizType,
          weekStart: row.weekStart,
          courseCode: row.courseCode,
          subjectName: row.subjectName,
          heldCount: 1,
        });
      }
    }

    return NextResponse.json({ data: [...byQuiz.values()] });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
