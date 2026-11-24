import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from ".";
import {
  academicSessions,
  courses,
  courseFaculties,
  levels,
  departments,
  faculties,
  topics,
} from "./schema";
import type { AuthContext } from "@/lib/auth/guard";
import { getTeachingScope, isCourseAllowed } from "@/lib/auth/teaching-scope";
import { ForbiddenError } from "@/lib/auth/errors";
import { listAuthoringQuizzes } from "./quiz-list";
import { paginate } from "@/lib/api/pagination";

export async function catalogDetails(
  auth: AuthContext,
  id: number,
  kind: "course" | "topic",
  topicPage: number,
  quizPage: number,
) {
  const db = getDb();
  const [topic] =
    kind === "topic"
      ? await db.select().from(topics).where(eq(topics.id, id)).limit(1)
      : [];
  if (kind === "topic" && !topic) return null;
  if (topic && auth.roleName !== "admin" && topic.createdBy !== auth.userId)
    throw new ForbiddenError();
  const courseId = topic?.courseId ?? id;
  if (!isCourseAllowed(await getTeachingScope(db, auth), courseId))
    throw new ForbiddenError();
  const [course] = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      semester: courses.semester,
      scope: courses.scopeType,
      level: levels.value,
      session: academicSessions.label,
      department: departments.name,
      faculty: faculties.name,
    })
    .from(courses)
    .innerJoin(levels, eq(levels.id, courses.levelId))
    .innerJoin(academicSessions, eq(academicSessions.id, courses.sessionId))
    .leftJoin(departments, eq(departments.id, courses.departmentId))
    .leftJoin(faculties, eq(faculties.id, sql`coalesce(${courses.facultyId}, ${departments.facultyId})`))
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return null;
  const sharedFaculties = await db
    .select({ name: faculties.name })
    .from(courseFaculties)
    .innerJoin(faculties, eq(faculties.id, courseFaculties.facultyId))
    .where(eq(courseFaculties.courseId, courseId))
    .orderBy(asc(faculties.name));
  const topicRows =
    kind === "course"
      ? await db
          .select({
            id: topics.id,
            title: topics.title,
          })
          .from(topics)
          .where(
            and(
              eq(topics.courseId, courseId),
              auth.roleName === "admin" ? undefined : eq(topics.createdBy, auth.userId),
            ),
          )
          .orderBy(asc(topics.title), asc(topics.id))
      : [];
  const quizRows = (
    await listAuthoringQuizzes(auth, {
      courseId,
      search: "",
      type: kind === "course" ? "course" : "topic",
    })
  ).filter((q) => kind === "course" || q.topicId === id);
  return {
    course: {
      ...course,
      sharedFaculties: sharedFaculties.map((row) => row.name).join(", ") || null,
    },
    topic,
    topics: paginate(topicRows, { page: topicPage, pageSize: 10 }),
    quizzes: paginate(
      quizRows.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        questionCount: q.questionCount,
        weekStart: q.weekStart,
      })),
      { page: quizPage, pageSize: 10 },
    ),
  };
}
