import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  cgpaRecords,
  courses,
  departments,
  faculties,
  levels,
  quizAttempts,
  quizzes,
  roles,
  studentProfiles,
  users,
} from "@/lib/db/schema";

/** GET /api/admin/users/students/[id] — profile + performance drill-down. */
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
    const [student] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        departmentName: departments.name,
        facultyName: faculties.name,
        levelValue: levels.value,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .innerJoin(faculties, eq(departments.facultyId, faculties.id))
      .innerJoin(levels, eq(studentProfiles.levelId, levels.id))
      .where(and(eq(users.id, id), eq(roles.name, "student")))
      .limit(1);

    if (!student) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Student not found" } },
        { status: 404 },
      );
    }

    const cgpaHistory = await db
      .select({ weekStart: cgpaRecords.weekStart, cgpaValue: cgpaRecords.cgpaValue })
      .from(cgpaRecords)
      .where(eq(cgpaRecords.userId, id))
      .orderBy(desc(cgpaRecords.weekStart));

    const attempts = await db
      .select({
        attemptId: quizAttempts.id,
        quizId: quizzes.id,
        quizTitle: quizzes.title,
        quizType: quizzes.quizType,
        courseCode: courses.code,
        attemptNumber: quizAttempts.attemptNumber,
        score: quizAttempts.score,
        submittedAt: quizAttempts.submittedAt,
        releasedAt: quizAttempts.releasedAt,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .leftJoin(courses, eq(quizzes.courseId, courses.id))
      .where(eq(quizAttempts.userId, id))
      .orderBy(desc(quizAttempts.submittedAt), asc(quizAttempts.id));

    const normalize = (v: string) => {
      const n = Number(v);
      return n > 5 ? (Math.min(5, n / 20)).toFixed(2) : v;
    };
    return NextResponse.json({
      student,
      currentCgpa: cgpaHistory[0]?.cgpaValue ? normalize(cgpaHistory[0].cgpaValue) : null,
      quizzesTaken: new Set(attempts.map((a) => a.quizId)).size,
      attempts,
      cgpaHistory: cgpaHistory.map((r) => ({ ...r, cgpaValue: normalize(r.cgpaValue) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
