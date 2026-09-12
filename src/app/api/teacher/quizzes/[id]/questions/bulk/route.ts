import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { questions, quizzes, quizQuestions } from "@/lib/db/schema";

const BATCH_LIMIT = 500;

const idsShape = z.object({
  questionIds: z
    .array(z.number().int().min(1))
    .min(1, "Select at least one question to attach")
    .max(BATCH_LIMIT, `A maximum of ${BATCH_LIMIT} questions per batch`),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

// Bulk attach: idempotent. Questions already on the quiz are skipped and reported,
// so a "select all + attach" that overlaps the current set still succeeds.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const quizId = parseId(rawId);
    if (quizId === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }
    const parsed = idsShape.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join(".") || "questionIds",
              code: i.code,
              message: i.message,
            })),
          },
        },
        { status: 422 },
      );
    }
    const ids = [...new Set(parsed.data.questionIds)];

    const db = getDb();

    const [quiz] = await db
      .select({ id: quizzes.id, status: quizzes.status, createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .orderBy(asc(quizzes.id));
    if (!quiz) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }
    if (!forbiddenUnlessOwned(auth, quiz.createdBy)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You can only attach questions to quizzes you created",
          },
        },
        { status: 403 },
      );
    }
    if (quiz.status === "published") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This quiz is published — its question set can no longer change",
          },
        },
        { status: 409 },
      );
    }

    const found = await db
      .select({ id: questions.id, status: questions.status, createdBy: questions.createdBy })
      .from(questions)
      .where(inArray(questions.id, ids))
      .orderBy(asc(questions.id));

    const foundIds = new Set(found.map((q) => q.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Questions not found: ${missing.join(", ")}`,
          },
        },
        { status: 404 },
      );
    }

    const notOwned = found.filter((q) => !forbiddenUnlessOwned(auth, q.createdBy));
    if (notOwned.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You can only attach questions you created",
          },
        },
        { status: 403 },
      );
    }

    const notPublished = found.filter((q) => q.status !== "published");
    if (notPublished.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "questionIds",
                code: "custom",
                message: `Only published questions can be attached to a quiz — draft questions: ${notPublished.map((q) => q.id).join(", ")}`,
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    const existing = await db
      .select({ questionId: quizQuestions.questionId })
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.quizId, quizId),
          inArray(quizQuestions.questionId, ids),
        ),
      )
      .orderBy(asc(quizQuestions.questionId));

    const attached = new Set(existing.map((r) => r.questionId));
    const toInsert = found
      .map((q) => q.id)
      .filter((id) => !attached.has(id));

    if (toInsert.length === 0) {
      return NextResponse.json(
        { data: { attached: 0, skippedAlreadyAttached: attached.size } },
        { status: 200 },
      );
    }

    try {
      await db.insert(quizQuestions).values(
        toInsert.map((questionId) => ({ quizId, questionId })),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "One or more of the selected questions is already attached to the quiz",
            },
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { data: { attached: toInsert.length, skippedAlreadyAttached: attached.size } },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
