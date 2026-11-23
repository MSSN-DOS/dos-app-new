import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb, type Db } from "@/lib/db";
import { quizHasAttempts } from "@/lib/db/quiz-builder";
import {
  passages,
  questions,
  quizImages,
  quizQuestions,
  quizzes,
} from "@/lib/db/schema";
import { removeQuizImageObject } from "@/lib/storage/supabase-storage";

const quizDeleteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
const quizArchiveSchema = z.object({ action: z.literal("archive") });

const findLockedQuiz = (db: Pick<Db, "select">, id: number) =>
  db.select({
    id: quizzes.id,
    title: quizzes.title,
    status: quizzes.status,
    attemptsStarted: quizzes.attemptsStarted,
  }).from(quizzes).where(eq(quizzes.id, id)).limit(1).for("update");

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

/**
 * DELETE /api/admin/quizzes/[id]
 *
 * Delete an unattempted quiz and its private content. Published quizzes require
 * title confirmation. Attempt history always blocks permanent deletion.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAuth(request, ["admin"]);
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const rawBody: unknown = await request.json().catch(() => ({}));
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      // Serialize confirmation and cleanup with publication and new attempts.
      const [quiz] = await findLockedQuiz(tx, id);
      if (!quiz) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Quiz not found" } },
          { status: 404 },
        );
      }

      if (await quizHasAttempts(tx, quiz)) {
        return NextResponse.json(
          { error: { code: "QUIZ_HAS_ATTEMPTS", message: "Archive this quiz to preserve its student attempts and scores." } },
          { status: 409 },
        );
      }
      if (quiz.status === "published") {
        const body = quizDeleteSchema.parse(rawBody);
        if (!body.title) {
          return NextResponse.json(
            {
              error: {
                code: "CONFIRMATION_REQUIRED",
                message: "Type the quiz title to confirm deleting it",
              },
            },
            { status: 409 },
          );
        }
        if (body.title.toLowerCase() !== quiz.title.trim().toLowerCase()) {
          return NextResponse.json(
            {
              error: {
                code: "CONFIRMATION_MISMATCH",
                message: "The title you typed does not match this quiz",
              },
            },
            { status: 409 },
          );
        }
      }

      const images = await tx
        .select({ path: quizImages.objectPath })
        .from(quizImages)
        .where(eq(quizImages.quizId, id))
        .orderBy(asc(quizImages.id));

      await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, id));
      await tx.delete(questions).where(eq(questions.builderQuizId, id));
      await tx.delete(passages).where(eq(passages.builderQuizId, id));
      await tx.delete(quizzes).where(eq(quizzes.id, id));
      return { images, status: quiz.status };
    });

    if (result instanceof NextResponse) return result;
    const { images, status } = result;
    const removals = await Promise.allSettled(
      images.map((i) => removeQuizImageObject(i.path)),
    );
    const orphaned = removals.filter((r) => r.status === "rejected").length;

    // TODO(needs-board-decision): no audit-trail table exists yet; same stopgap as student deletion.
    console.log(
      `[audit] quiz hard-deleted: actor=${actor.userId} quiz=${id} status=${status} ` +
        `images=${images.length} orphaned=${orphaned} at=${new Date().toISOString()}`,
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) {
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
    return errorResponse(err);
  }
}

/** Archive by reusing the existing unpublish lifecycle. In-flight attempts can finish. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAuth(request, ["admin"]);
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }
    const input = quizArchiveSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid action", details: input.error.issues } },
        { status: 422 },
      );
    }
    const archived = await getDb().transaction(async (tx) => {
      const [quiz] = await findLockedQuiz(tx, id);
      if (!quiz) return null;
      if (quiz.status === "draft") return false;

      const hasAttempts = await quizHasAttempts(tx, quiz);
      await tx.update(quizzes).set({
        status: "draft",
        unpublishedAt: new Date(),
        attemptsStarted: hasAttempts,
        builderRevision: sql`${quizzes.builderRevision} + 1`,
      }).where(eq(quizzes.id, id));
      return true;
    });
    if (archived === null) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }
    if (archived) console.log(`[audit] quiz archived: actor=${actor.userId} quiz=${id}`);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
