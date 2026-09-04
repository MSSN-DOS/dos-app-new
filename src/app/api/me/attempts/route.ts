import { NextResponse } from "next/server";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  courses,
  jambSubjects,
  quizAttempts,
  quizzes,
  roles,
  topics,
} from "@/lib/db/schema";

const filtersSchema = z.object({
  type: z.enum(["topic", "course"]).optional(),
  courseId: z.coerce.number().int().min(1).optional(),
  jambSubjectId: z.coerce.number().int().min(1).optional(),
});

function parseFilters(request: Request) {
  const url = new URL(request.url);
  return filtersSchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
    courseId: url.searchParams.get("courseId") ?? undefined,
    jambSubjectId: url.searchParams.get("jambSubjectId") ?? undefined,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    const parsed = parseFilters(request);
    const pagination = parsePagination(new URL(request.url).searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid history filters",
            details: parsed.error.issues,
          },
        },
        { status: 422 },
      );
    }
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }

    const db = getDb();
    const [role] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, auth.roleId))
      .limit(1);
    const filters = parsed.data;

    if (role?.name === "student" && filters.jambSubjectId !== undefined) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Students can only filter by course" } },
        { status: 422 },
      );
    }
    if (role?.name === "aspirant" && filters.courseId !== undefined) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Aspirants can only filter by JAMB subject" } },
        { status: 422 },
      );
    }

    const rows = await db
      .select({
        id: quizAttempts.id,
        quizId: quizAttempts.quizId,
        attemptNumber: quizAttempts.attemptNumber,
        score: quizAttempts.score,
        submittedAt: quizAttempts.submittedAt,
        releasedAt: quizAttempts.releasedAt,
        title: quizzes.title,
        quizType: quizzes.quizType,
        courseId: quizzes.courseId,
        courseCode: courses.code,
        topicId: quizzes.topicId,
        topicTitle: topics.title,
        jambSubjectId: quizzes.jambSubjectId,
        subjectName: jambSubjects.name,
        weekStart: quizzes.weekStart,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(topics, eq(quizzes.topicId, topics.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
      .where(and(eq(quizAttempts.userId, auth.userId), isNotNull(quizAttempts.submittedAt)))
      .orderBy(desc(quizAttempts.submittedAt), asc(quizAttempts.id));

    const bestScores = new Map<number, number>();
    for (const row of rows) {
      if (row.score !== null && (row.quizType === "topic" || row.releasedAt !== null)) {
        const score = Number(row.score);
        const best = bestScores.get(row.quizId) ?? score;
        bestScores.set(row.quizId, Math.max(best, score));
      }
    }

    const filteredRows = rows.filter((row) => {
      if (filters.type && row.quizType !== filters.type) return false;
      if (filters.courseId !== undefined && row.courseId !== filters.courseId) return false;
      if (filters.jambSubjectId !== undefined && row.jambSubjectId !== filters.jambSubjectId) {
        return false;
      }
      return true;
    });

    const data = filteredRows.map((row) => {
      const base = {
        id: row.id,
        quizId: row.quizId,
        attemptNumber: row.attemptNumber,
        title: row.title,
        quizType: row.quizType,
        courseId: row.courseId,
        courseCode: row.courseCode,
        topicId: row.topicId,
        topicTitle: row.topicTitle,
        jambSubjectId: row.jambSubjectId,
        subjectName: row.subjectName,
        weekStart: row.weekStart,
        attemptedAt: row.submittedAt?.toISOString() ?? null,
      };

      if (row.quizType === "course" && row.releasedAt === null) return base;

      return {
        ...base,
        score: Number(row.score),
        bestScore: bestScores.get(row.quizId) ?? Number(row.score),
      };
    });

    const courseFilters = Array.from(
      new Map(
        rows
          .filter((row) => row.courseId !== null && row.courseCode !== null)
          .map((row) => [row.courseId, { id: row.courseId, code: row.courseCode }]),
      ).values(),
    );
    const jambSubjectFilters = Array.from(
      new Map(
        rows
          .filter((row) => row.jambSubjectId !== null && row.subjectName !== null)
          .map((row) => [row.jambSubjectId, { id: row.jambSubjectId, name: row.subjectName }]),
      ).values(),
    );

    const page = paginate(data, pagination.params);
    return NextResponse.json({
      ...page,
      filters: { courses: courseFilters, jambSubjects: jambSubjectFilters },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
