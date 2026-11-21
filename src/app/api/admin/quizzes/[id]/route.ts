import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizHasAttempts } from "@/lib/db/quiz-builder";
import {
  bestScores,
  cgpaRecords,
  passages,
  postUtmeScores,
  questions,
  quizAttempts,
  quizImages,
  quizQuestions,
  quizzes,
} from "@/lib/db/schema";
import { recomputeWeeklyScores } from "@/lib/scoring/apply-release";
import { removeQuizImageObject } from "@/lib/storage/supabase-storage";

const quizDeleteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

/**
 * DELETE /api/admin/quizzes/[id]
 *
 * Admin-only hard delete of a draft or published quiz. A draft nobody has attempted deletes on a
 * plain request. A published quiz, or any quiz that has recorded attempts, also needs its exact
 * title in the body, because the delete takes real student data with it: every attempt, answer
 * and best score for the quiz.
 *
 * One transaction removes everything that references the quiz without a cascade, in FK order:
 * attempts (their answers cascade), best scores, quiz-question links, the quiz's private builder
 * questions and passages, then the quiz (its image rows cascade). Weekly CGPA and Post-UTME
 * rows for the affected students and week are then rebuilt from what is left, so a deleted
 * quiz stops counting instead of leaving stale aggregates. Image files are removed from storage
 * after the commit, best-effort, since an orphaned file is harmless and a failed commit is not.
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

    const db = getDb();
    const [quiz] = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        status: quizzes.status,
        weekStart: quizzes.weekStart,
        attemptsStarted: quizzes.attemptsStarted,
      })
      .from(quizzes)
      .where(eq(quizzes.id, id))
      .limit(1);
    if (!quiz) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Quiz not found" } },
        { status: 404 },
      );
    }

    const needsTitle = quiz.status === "published" || (await quizHasAttempts(db, quiz));
    if (needsTitle) {
      const body = quizDeleteSchema.parse(await request.json().catch(() => ({})));
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

    const images = await db
      .select({ path: quizImages.objectPath })
      .from(quizImages)
      .where(eq(quizImages.quizId, id))
      .orderBy(asc(quizImages.id));

    await db.transaction(async (tx) => {
      const affected = await tx
        .select({ userId: bestScores.userId })
        .from(bestScores)
        .where(eq(bestScores.quizId, id))
        .orderBy(asc(bestScores.userId));
      const userIds = [...new Set(affected.map((row) => row.userId))];

      // attempt_answers cascade off quiz_attempts.
      await tx.delete(quizAttempts).where(eq(quizAttempts.quizId, id));
      await tx.delete(bestScores).where(eq(bestScores.quizId, id));
      await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, id));
      // Builder-owned questions are private to this quiz; options and blanks cascade.
      await tx.delete(questions).where(eq(questions.builderQuizId, id));
      await tx.delete(passages).where(eq(passages.builderQuizId, id));
      await tx.delete(quizzes).where(eq(quizzes.id, id));

      if (quiz.weekStart && userIds.length > 0) {
        await tx
          .delete(cgpaRecords)
          .where(
            and(
              inArray(cgpaRecords.userId, userIds),
              eq(cgpaRecords.weekStart, quiz.weekStart),
            ),
          );
        await tx
          .delete(postUtmeScores)
          .where(
            and(
              inArray(postUtmeScores.userId, userIds),
              eq(postUtmeScores.weekStart, quiz.weekStart),
            ),
          );
        await recomputeWeeklyScores(tx, userIds, quiz.weekStart);
      }
    });

    const removals = await Promise.allSettled(
      images.map((i) => removeQuizImageObject(i.path)),
    );
    const orphaned = removals.filter((r) => r.status === "rejected").length;

    // TODO(needs-board-decision): no audit-trail table exists yet; same stopgap as student deletion.
    console.log(
      `[audit] quiz hard-deleted: actor=${actor.userId} quiz=${id} status=${quiz.status} ` +
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
