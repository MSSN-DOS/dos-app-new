import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  aspirantProfiles,
  courses,
  departments,
  jambSubjects,
  postUtmeScores,
  quizAttempts,
  quizzes,
  roles,
  users,
} from "@/lib/db/schema";

/** GET /api/admin/users/aspirants/[id] — profile + Post-UTME drill-down. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();
    const [aspirant] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        aspirationDepartment: departments.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(aspirantProfiles, eq(aspirantProfiles.userId, users.id))
      .leftJoin(departments, eq(aspirantProfiles.aspirationDepartmentId, departments.id))
      .where(and(eq(users.id, id), eq(roles.name, "aspirant")))
      .limit(1);

    if (!aspirant) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Aspirant not found" } },
        { status: 404 },
      );
    }

    const postUtmeHistory = await db
      .select({
        weekStart: postUtmeScores.weekStart,
        rawScore: postUtmeScores.rawScore,
        convertedScore50: postUtmeScores.convertedScore50,
      })
      .from(postUtmeScores)
      .where(eq(postUtmeScores.userId, id))
      .orderBy(desc(postUtmeScores.weekStart));

    const attempts = await db
      .select({
        attemptId: quizAttempts.id,
        quizId: quizzes.id,
        quizTitle: quizzes.title,
        quizType: quizzes.quizType,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
        attemptNumber: quizAttempts.attemptNumber,
        score: quizAttempts.score,
        submittedAt: quizAttempts.submittedAt,
        releasedAt: quizAttempts.releasedAt,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
      .where(eq(quizAttempts.userId, id))
      .orderBy(desc(quizAttempts.submittedAt), asc(quizAttempts.id));

    return NextResponse.json({
      aspirant,
      latestPostUtme: postUtmeHistory[0]?.convertedScore50 ?? null,
      attempts,
      postUtmeHistory,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
