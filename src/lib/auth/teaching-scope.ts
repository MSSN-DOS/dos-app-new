import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { teacherSubjects } from "@/lib/db/schema";

import type { AuthContext } from "./guard";

/**
 * What the caller is allowed to author for.
 *
 * Mirrors `ownershipScope` in `./ownership.ts`: an Admin is unrestricted and bypasses this
 * check entirely, exactly the way an Admin bypasses ownership. A Teacher is limited to their
 * assigned courses and JAMB subjects.
 */
export interface TeachingScope {
  unrestricted: boolean;
  courseIds: readonly number[];
  jambSubjectIds: readonly number[];
}

const UNRESTRICTED: TeachingScope = {
  unrestricted: true,
  courseIds: [],
  jambSubjectIds: [],
};

/** No assignments at all — every check fails, which is the safe direction. */
const NOTHING: TeachingScope = {
  unrestricted: false,
  courseIds: [],
  jambSubjectIds: [],
};

export async function getTeachingScope(
  db: ReturnType<typeof getDb>,
  auth: AuthContext,
): Promise<TeachingScope> {
  // Only `admin` is unrestricted. Anything else — including an AuthContext whose roleName was
  // never resolved — falls through to an assignment lookup that yields nothing. Fail closed.
  if (auth.roleName === "admin") return UNRESTRICTED;

  const rows = await db
    .select({
      courseId: teacherSubjects.courseId,
      jambSubjectId: teacherSubjects.jambSubjectId,
    })
    .from(teacherSubjects)
    .where(eq(teacherSubjects.userId, auth.userId))
    .orderBy(asc(teacherSubjects.id));

  if (rows.length === 0) return NOTHING;

  const courseIds: number[] = [];
  const jambSubjectIds: number[] = [];
  for (const row of rows) {
    if (row.courseId !== null) courseIds.push(row.courseId);
    if (row.jambSubjectId !== null) jambSubjectIds.push(row.jambSubjectId);
  }

  return { unrestricted: false, courseIds, jambSubjectIds };
}

export function isCourseAllowed(scope: TeachingScope, courseId: number): boolean {
  return scope.unrestricted || scope.courseIds.includes(courseId);
}

export function isJambSubjectAllowed(scope: TeachingScope, jambSubjectId: number): boolean {
  return scope.unrestricted || scope.jambSubjectIds.includes(jambSubjectId);
}

/**
 * The check every authoring write path needs: a payload carries a course OR a JAMB subject,
 * and we want to know whether the caller may write there.
 *
 * A payload with neither is not this function's problem — the Zod schemas already require
 * exactly one (see the XOR rules in `lib/validation/quizzes.ts` and `questions.ts`).
 */
export function isTrackAllowed(
  scope: TeachingScope,
  track: { courseId?: number | null; jambSubjectId?: number | null },
): boolean {
  if (scope.unrestricted) return true;
  if (track.courseId != null) return isCourseAllowed(scope, track.courseId);
  if (track.jambSubjectId != null) return isJambSubjectAllowed(scope, track.jambSubjectId);
  return false;
}
