import { and, asc, eq, ilike, type SQL } from "drizzle-orm";
import type { AuthContext } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import type { QuizListFilters } from "@/lib/validation/quizzes";
import { getDb } from ".";
import { courses, jambSubjects, quizzes } from "./schema";

export function authoringQuizConditions(
  auth: AuthContext,
  filters: QuizListFilters,
): SQL[] {
  const conditions: SQL[] = [];
  const owner = ownershipScope(auth);
  if (owner !== null) conditions.push(eq(quizzes.createdBy, owner));
  if (filters.type) conditions.push(eq(quizzes.quizType, filters.type));
  if (filters.status) conditions.push(eq(quizzes.status, filters.status));
  if (filters.courseId) conditions.push(eq(quizzes.courseId, filters.courseId));
  if (filters.search) {
    const literal = filters.search.replace(/[\\%_]/g, (char) => `\\${char}`);
    conditions.push(ilike(quizzes.title, `%${literal}%`));
  }
  return conditions;
}

export async function listAuthoringQuizzes(auth: AuthContext, filters: QuizListFilters) {
  const conditions = authoringQuizConditions(auth, filters);
  return getDb()
    .select({
      id: quizzes.id,
      title: quizzes.title,
      quizType: quizzes.quizType,
      courseId: quizzes.courseId,
      jambSubjectId: quizzes.jambSubjectId,
      topicId: quizzes.topicId,
      weekStart: quizzes.weekStart,
      questionCount: quizzes.questionCount,
      timeLimitMinutes: quizzes.timeLimitMinutes,
      passMark: quizzes.passMark,
      allowMultipleAttempts: quizzes.allowMultipleAttempts,
      loseFocusPolicy: quizzes.loseFocusPolicy,
      instructions: quizzes.instructions,
      description: quizzes.description,
      status: quizzes.status,
      courseCode: courses.code,
      subjectName: jambSubjects.name,
      createdBy: quizzes.createdBy,
      createdAt: quizzes.createdAt,
    })
    .from(quizzes)
    .leftJoin(courses, eq(quizzes.courseId, courses.id))
    .leftJoin(jambSubjects, eq(quizzes.jambSubjectId, jambSubjects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(quizzes.id));
}
