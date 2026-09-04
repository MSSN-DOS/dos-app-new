import { and, eq, inArray } from "drizzle-orm";

import type { Db } from "@/lib/db";
import {
  courses,
  courseFaculties,
  departments,
} from "@/lib/db/schema";
import { studentProfiles } from "@/lib/db/schema/profiles";
import { getActiveSemester } from "@/lib/semester";

/** The quiz fields visibility checks need; callers select these columns. */
export interface QuizVisibilityRow {
  courseId: number | null;
  jambSubjectId: number | null;
}

/**
 * Whether a Student may see/attempt this quiz: their profile must exist and the
 * quiz's course must be visible to them — scopeType department (their dept),
 * faculty (their faculty), general (everyone), or interfaculty (attached to
 * their faculty via course_faculties) — within the course's active semester
 * and their level. Aspirants use the JAMB branch instead, never this.
 */
export async function studentCanAccessQuiz(
  db: Db,
  userId: number,
  quiz: QuizVisibilityRow & { levelId?: number; semester?: string }
): Promise<boolean> {
  if (quiz.courseId === null || quiz.jambSubjectId !== null) {
    return false;
  }

  const [profile] = await db
    .select({
      departmentId: studentProfiles.departmentId,
      levelId: studentProfiles.levelId,
    })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    return false;
  }

  const [course] = await db
    .select({
      id: courses.id,
      semester: courses.semester,
      levelId: courses.levelId,
      scopeType: courses.scopeType,
      departmentId: courses.departmentId,
      facultyId: courses.facultyId,
    })
    .from(courses)
    .where(eq(courses.id, quiz.courseId))
    .limit(1);
  if (!course) {
    return false;
  }

  const activeSemester = await getActiveSemester(db);
  if (course.semester !== activeSemester || course.levelId !== profile.levelId) {
    return false;
  }

  if (course.scopeType === "general") {
    return true;
  }
  if (course.scopeType === "department") {
    return course.departmentId === profile.departmentId;
  }
  if (course.scopeType === "faculty" || course.scopeType === "interfaculty") {
    const [dept] = await db
      .select({ facultyId: departments.facultyId })
      .from(departments)
      .where(eq(departments.id, profile.departmentId))
      .limit(1);
    if (!dept?.facultyId) {
      return false;
    }
    if (course.scopeType === "faculty") {
      return course.facultyId === dept.facultyId;
    }
    const links = await db
      .select({ courseId: courseFaculties.courseId })
      .from(courseFaculties)
      .where(
        and(
          eq(courseFaculties.facultyId, dept.facultyId),
          inArray(courseFaculties.courseId, [course.id])
        )
      );
    return links.length > 0;
  }
  return false;
}
