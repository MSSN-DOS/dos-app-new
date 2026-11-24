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
  quizzes,
} from "./schema";
import type { AuthContext } from "@/lib/auth/guard";
import { getTeachingScope, isCourseAllowed } from "@/lib/auth/teaching-scope";
import { ForbiddenError } from "@/lib/auth/errors";
import { authoringQuizConditions } from "./quiz-list";

function pageMeta(total: number, requested: number) {
  const totalPages = Math.max(1, Math.ceil(total / 10));
  return { total, pageSize: 10, totalPages, page: Math.min(requested, totalPages) };
}

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
    .leftJoin(
      faculties,
      eq(faculties.id, sql`coalesce(${courses.facultyId}, ${departments.facultyId})`),
    )
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return null;
  const sharedFaculties = await db
    .select({ name: faculties.name })
    .from(courseFaculties)
    .innerJoin(faculties, eq(faculties.id, courseFaculties.facultyId))
    .where(eq(courseFaculties.courseId, courseId))
    .orderBy(asc(faculties.name));
  const topicCondition = and(
    eq(topics.courseId, courseId),
    auth.roleName === "admin" ? undefined : eq(topics.createdBy, auth.userId),
  );
  const [topicCount] =
    kind === "course"
      ? await db
          .select({ total: sql<number>`count(*)::int` })
          .from(topics)
          .where(topicCondition)
          .limit(1)
      : [];
  const topicMeta = pageMeta(topicCount?.total ?? 0, topicPage);
  const topicRows =
    kind === "course"
      ? await db
          .select({
            id: topics.id,
            title: topics.title,
          })
          .from(topics)
          .where(topicCondition)
          .orderBy(asc(topics.title), asc(topics.id))
          .limit(10)
          .offset((topicMeta.page - 1) * 10)
      : [];
  const quizCondition = and(
    ...authoringQuizConditions(auth, {
      courseId,
      search: "",
      type: kind === "course" ? "course" : "topic",
    }),
    kind === "topic" ? eq(quizzes.topicId, id) : undefined,
  );
  const [quizCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(quizCondition)
    .limit(1);
  const quizMeta = pageMeta(quizCount?.total ?? 0, quizPage);
  const quizRows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      status: quizzes.status,
      questionCount: quizzes.questionCount,
      weekStart: quizzes.weekStart,
    })
    .from(quizzes)
    .where(quizCondition)
    .orderBy(asc(quizzes.id))
    .limit(10)
    .offset((quizMeta.page - 1) * 10);
  return {
    course: {
      ...course,
      sharedFaculties: sharedFaculties.map((row) => row.name).join(", ") || null,
    },
    topic,
    topics: { data: topicRows, meta: topicMeta },
    quizzes: { data: quizRows, meta: quizMeta },
  };
}
