import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  courses,
  courseFaculties,
  departments,
  jambSubjects,
  quizzes,
  roles,
} from "@/lib/db/schema";
import { studentProfiles } from "@/lib/db/schema/profiles";
import { errorResponse } from "@/lib/api/response";
import { getActiveSemester } from "@/lib/semester";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    const db = getDb();

    const [roleRow] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, auth.roleId))
      .orderBy(asc(roles.id))
      .limit(1);
    const roleName = roleRow?.name ?? "";

    if (roleName === "aspirant") {
      const rows = await db
        .select({
          id: quizzes.id,
          title: quizzes.title,
          quizType: quizzes.quizType,
          jambSubjectId: quizzes.jambSubjectId,
          subjectName: jambSubjects.name,
          weekStart: quizzes.weekStart,
          questionCount: quizzes.questionCount,
          timeLimitMinutes: quizzes.timeLimitMinutes,
        })
        .from(quizzes)
        .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
        .where(and(eq(quizzes.status, "published"), isNotNull(quizzes.jambSubjectId)))
        .orderBy(asc(quizzes.id));

      return NextResponse.json({ data: rows });
    }

    const profileRows = await db
      .select({
        departmentId: studentProfiles.departmentId,
        levelId: studentProfiles.levelId,
      })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, auth.userId))
      .orderBy(asc(studentProfiles.userId))
      .limit(1);

    const profile = profileRows[0];
    if (!profile) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Complete onboarding first" } },
        { status: 404 }
      );
    }

    const deptRows = await db
      .select({ facultyId: departments.facultyId })
      .from(departments)
      .where(eq(departments.id, profile.departmentId))
      .orderBy(asc(departments.id))
      .limit(1);

    const facultyId = deptRows[0]?.facultyId ?? null;

    let interfacultyCourseIds: number[] = [];
    if (facultyId !== null) {
      const linkRows = await db
        .select({ courseId: courseFaculties.courseId })
        .from(courseFaculties)
        .where(eq(courseFaculties.facultyId, facultyId))
        .orderBy(asc(courseFaculties.courseId));
      interfacultyCourseIds = linkRows.map((row) => row.courseId);
    }

    const activeSemester = await getActiveSemester(db);

    const accessConds = [
      eq(courses.scopeType, "general"),
      and(
        eq(courses.scopeType, "department"),
        eq(courses.departmentId, profile.departmentId)
      ),
    ];
    if (facultyId !== null) {
      accessConds.push(
        and(eq(courses.scopeType, "faculty"), eq(courses.facultyId, facultyId))
      );
      if (interfacultyCourseIds.length > 0) {
        accessConds.push(
          and(
            eq(courses.scopeType, "interfaculty"),
            inArray(courses.id, interfacultyCourseIds)
          )
        );
      }
    }

    const rows = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        quizType: quizzes.quizType,
        courseCode: courses.code,
        weekStart: quizzes.weekStart,
        questionCount: quizzes.questionCount,
        timeLimitMinutes: quizzes.timeLimitMinutes,
      })
      .from(quizzes)
      .innerJoin(courses, eq(quizzes.courseId, courses.id))
      .where(
        and(
          eq(quizzes.status, "published"),
          eq(courses.semester, activeSemester),
          eq(courses.levelId, profile.levelId),
          or(...accessConds)
        )
      )
      .orderBy(asc(quizzes.id));

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
