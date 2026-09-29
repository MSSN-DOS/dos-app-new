import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { resolveCourseQuizWindow } from "@/lib/quizzes/window";
import { quizWindowSchema, type QuizWindowInput } from "@/lib/validation/quizzes";

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

class NotFoundError extends Error {}
class NotACourseQuizError extends Error {}

async function setWindow(
  db: ReturnType<typeof getDb>,
  id: number,
  input: QuizWindowInput,
): Promise<{ id: number; opensAt: Date | null; closesAt: Date | null; effective: { opensAt: string; closesAt: string } | null }> {
  const existing = await db
    .select({
      id: quizzes.id,
      quizType: quizzes.quizType,
      weekStart: quizzes.weekStart,
    })
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  const quiz = existing[0];
  if (!quiz) throw new NotFoundError();
  if (quiz.quizType !== "course") throw new NotACourseQuizError();

  const [updated] = await db
    .update(quizzes)
    .set({ opensAt: input.opensAt, closesAt: input.closesAt })
    .where(and(eq(quizzes.id, id)))
    .returning({ id: quizzes.id, opensAt: quizzes.opensAt, closesAt: quizzes.closesAt });

  const effective = quiz.weekStart
    ? resolveCourseQuizWindow(quiz.weekStart, {
        opensAt: input.opensAt,
        closesAt: input.closesAt,
      })
    : null;

  return {
    id: updated?.id ?? id,
    opensAt: updated?.opensAt ?? null,
    closesAt: updated?.closesAt ?? null,
    effective: effective
      ? { opensAt: effective.opensAt.toISOString(), closesAt: effective.closesAt.toISOString() }
      : null,
  };
}

/**
 * PATCH /api/admin/quizzes/[id]/window — { opensAt, closesAt }, either nullable.
 * Both null clears the override and restores the default Saturday 00:00 -> Monday 00:00 WAT
 * window (DESIGN.md §4 decision 6, admin-overridable per Board decision 2026-09-28).
 * Course Quizzes only; Topic Quizzes have no window and are rejected with 409.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Quiz id must be a positive integer" } },
        { status: 422 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const parsed = quizWindowSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const data = await setWindow(db, id, parsed.data);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }
    if (error instanceof NotACourseQuizError) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Only Course Quizzes have an availability window",
          },
        },
        { status: 409 },
      );
    }
    console.error(error);
    return errorResponse(error);
  }
}
