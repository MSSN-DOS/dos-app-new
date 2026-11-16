import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { ForbiddenError } from "@/lib/auth/errors";
import { requireAuth } from "@/lib/auth/guard";
import { getTeachingScope, isTrackAllowed } from "@/lib/auth/teaching-scope";
import { getDb } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { listAuthoringQuizzes } from "@/lib/db/quiz-list";
import { quizCreateSchema, quizListFiltersSchema } from "@/lib/validation/quizzes";
import { newQuizSettings } from "@/lib/db/quiz-preferences";

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
    const params = new URL(request.url).searchParams;
    const pagination = parsePagination(params);
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
    const filters = quizListFiltersSchema.parse(Object.fromEntries(params));
    const rows = await listAuthoringQuizzes(auth, filters);

    return NextResponse.json(paginate(rows, pagination.params));
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const body = await request.json();
    const input = quizCreateSchema.parse(body);
    const db = getDb();

    // A Teacher may only build quizzes for the subjects an Admin assigned them (Admin is
    // unrestricted). 403 rather than 404: the catalogue isn't secret and the picker is
    // filtered, so reaching here means a stale or forged request.
    const scope = await getTeachingScope(db, auth);
    if (!isTrackAllowed(scope, input)) {
      throw new ForbiddenError("You do not teach this course or JAMB subject");
    }

    const settings = await newQuizSettings(auth.userId);
    const [row] = await db
      .insert(quizzes)
      .values({
        title: input.title,
        quizType: input.quizType,
        courseId: input.courseId ?? null,
        jambSubjectId: input.jambSubjectId ?? null,
        topicId: input.topicId ?? null,
        weekStart: input.weekStart ?? null,
        ...settings,
        timeLimitMinutes: null,
        timeLimitSeconds: null,
        passMark: 60,
        status: "draft",
        createdBy: auth.userId,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
