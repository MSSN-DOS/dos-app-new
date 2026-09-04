import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { courses, topics } from "@/lib/db/schema";
import { topicCreateSchema } from "@/lib/validation/topics";

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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const pagination = parsePagination(new URL(request.url).searchParams);
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }
    const db = getDb();
    const courseIdParam = new URL(request.url).searchParams.get("courseId");
    const ownerT = ownershipScope(auth);
    const ownerCond = ownerT !== null ? eq(topics.createdBy, ownerT) : undefined;
    const courseCond =
      courseIdParam !== null && /^\d+$/.test(courseIdParam)
        ? eq(topics.courseId, Number(courseIdParam))
        : undefined;
    const whereCond =
      courseCond && ownerCond
        ? and(courseCond, ownerCond)
        : (courseCond ?? ownerCond);
    const base = db
      .select({
        id: topics.id,
        title: topics.title,
        courseId: topics.courseId,
        courseCode: courses.code,
        createdBy: topics.createdBy,
        createdAt: topics.createdAt,
      })
      .from(topics)
      .innerJoin(courses, eq(topics.courseId, courses.id));
    const rows = whereCond
      ? await base.where(whereCond).orderBy(asc(topics.title))
      : await base.orderBy(asc(topics.title));

    return NextResponse.json(paginate(rows, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const data = topicCreateSchema.parse(await request.json());

    const db = getDb();
    // Titles are unique within a course (no DB constraint — enforced here).
    const [existing] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.title, data.title), eq(topics.courseId, data.courseId)))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Topic "${data.title}" already exists in this course`,
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(topics)
      .values({ courseId: data.courseId, title: data.title, createdBy: auth.userId })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
