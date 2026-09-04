import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  courses,
  jambSubjects,
  quizAttempts,
  quizzes,
} from "@/lib/db/schema";
import { heldQuerySchema } from "@/lib/validation/scores";

function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "query",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

/** GET /api/admin/scores/held?week=YYYY-MM-DD — held attempts grouped per quiz. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const query = heldQuerySchema.safeParse({
      week: new URL(request.url).searchParams.get("week") ?? undefined,
    });
    if (!query.success) return validationError(query.error);
    const week = query.data.week;

    const rows = await db
      .select({
        quizId: quizAttempts.quizId,
        title: quizzes.title,
        weekStart: quizzes.weekStart,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
      .where(
        and(
          isNotNull(quizAttempts.submittedAt),
          isNull(quizAttempts.releasedAt),
          isNotNull(quizzes.weekStart),
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
