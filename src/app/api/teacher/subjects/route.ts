import { asc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getTeachingScope } from "@/lib/auth/teaching-scope";
import { getDb } from "@/lib/db";
import { courses, jambSubjects } from "@/lib/db/schema";

/**
 * GET /api/teacher/subjects
 *
 * The courses and JAMB subjects the caller may author for. A Teacher gets only what an Admin
 * assigned them; an Admin gets the whole catalogue.
 *
 * This exists so the authoring pickers can never offer something the write endpoints would
 * reject — the list and the enforcement read from the same source.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const db = getDb();
    const scope = await getTeachingScope(db, auth);

    const courseRows = scope.unrestricted
      ? await db
          .select({ id: courses.id, code: courses.code, title: courses.title })
          .from(courses)
          .orderBy(asc(courses.code))
      : scope.courseIds.length > 0
        ? await db
            .select({ id: courses.id, code: courses.code, title: courses.title })
            .from(courses)
            .where(inArray(courses.id, [...scope.courseIds]))
            .orderBy(asc(courses.code))
        : [];

    const subjectRows = scope.unrestricted
      ? await db
          .select({ id: jambSubjects.id, name: jambSubjects.name })
          .from(jambSubjects)
          .orderBy(asc(jambSubjects.name))
      : scope.jambSubjectIds.length > 0
        ? await db
            .select({ id: jambSubjects.id, name: jambSubjects.name })
            .from(jambSubjects)
            .where(inArray(jambSubjects.id, [...scope.jambSubjectIds]))
            .orderBy(asc(jambSubjects.name))
        : [];

    return NextResponse.json({
      data: { courses: courseRows, jambSubjects: subjectRows },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
