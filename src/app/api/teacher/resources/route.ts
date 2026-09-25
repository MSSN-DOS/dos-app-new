import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/auth/errors";
import { requireAuth } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getTeachingScope, isTrackAllowed } from "@/lib/auth/teaching-scope";
import { parseVideoLink } from "@/lib/content/video-link";
import { getDb } from "@/lib/db";
import { contentItems, courses, jambSubjects } from "@/lib/db/schema";
import { videoCreateSchema } from "@/lib/validation/content";

function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "body",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

/**
 * GET /api/teacher/resources — the caller's own video links (Admin sees all of them).
 *
 * Always filtered to `type = 'video'`: this endpoint exists for link submission, and
 * pdf/article stay Admin-only (DESIGN.md §6). A teacher cannot reach them through here.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const db = getDb();
    const owner = ownershipScope(auth);

    const conds = [eq(contentItems.type, "video")];
    if (owner !== null) conds.push(eq(contentItems.uploadedBy, owner));

    const rows = await db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        url: contentItems.bodyOrFileUrl,
        courseId: contentItems.courseId,
        jambSubjectId: contentItems.jambSubjectId,
        createdAt: contentItems.createdAt,
        uploadedBy: contentItems.uploadedBy,
        courseCode: courses.code,
        subjectName: jambSubjects.name,
      })
      .from(contentItems)
      .leftJoin(courses, eq(contentItems.courseId, courses.id))
      .leftJoin(jambSubjects, eq(contentItems.jambSubjectId, jambSubjects.id))
      .where(and(...conds))
      .orderBy(desc(contentItems.createdAt));

    const data = rows.map(({ url, ...row }) => {
      const parsed = parseVideoLink(url);
      return {
        ...row,
        url,
        provider: parsed.ok ? parsed.link.provider : "other",
        watchUrl: parsed.ok ? parsed.link.watchUrl : url,
        embedUrl: parsed.ok ? parsed.link.embedUrl : null,
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/teacher/resources — submit a video link.
 *
 * Live immediately (no approval queue), matching how Teachers already publish quizzes and
 * topics directly (AGENTS.md §3). Admin can delete a bad link afterwards.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const input = videoCreateSchema.parse(await request.json());
    const db = getDb();

    const scope = await getTeachingScope(db, auth);
    if (!isTrackAllowed(scope, input)) {
      throw new ForbiddenError("You do not teach this course or JAMB subject");
    }

    // Verify the scoped target exists before writing.
    if (input.courseId !== undefined) {
      const [course] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);
      if (!course) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Course not found" } },
          { status: 404 },
        );
      }
    }
    if (input.jambSubjectId !== undefined) {
      const [subject] = await db
        .select({ id: jambSubjects.id })
        .from(jambSubjects)
        .where(eq(jambSubjects.id, input.jambSubjectId))
        .limit(1);
      if (!subject) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "JAMB subject not found" } },
          { status: 404 },
        );
      }
    }

    // The URL the submitter pasted is stored as-is — normalisation happens at read time, so
    // improving the parser later improves every existing link instead of only new ones.
    const [row] = await db
      .insert(contentItems)
      .values({
        type: "video",
        title: input.title,
        bodyOrFileUrl: input.url,
        courseId: input.courseId ?? null,
        jambSubjectId: input.jambSubjectId ?? null,
        uploadedBy: auth.userId,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
