import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { quizAttempts, quizzes } from "@/lib/db/schema";
import { finalizeUnsubmittedAttempt } from "@/lib/quizzes/finalize-attempt";

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

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

    const db = getDb();

    const [quiz] = await db
      .select({
        id: quizzes.id,
        status: quizzes.status,
        createdBy: quizzes.createdBy,
      })
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
            message: "You can only unpublish quizzes you created",
          },
        },
        { status: 403 },
      );
    }

    if (quiz.status !== "published") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This quiz is already a draft",
          },
        },
        { status: 409 },
      );
    }

    const [released] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), isNotNull(quizAttempts.releasedAt)))
      .orderBy(asc(quizAttempts.id));
    if (released && released.count > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `This quiz has ${released.count} released score(s). Released results count toward CGPA and the Post-UTME projection, so this quiz is now permanently frozen.`,
          },
        },
        { status: 409 },
      );
    }

    // R-1: an attempt with `submittedAt IS NULL` is invisible to the "already attempted" guard,
    // so a student left mid-quiz silently gets a free retake when the draft comes back. The Board
    // decision recorded at STATE.md:114 says in-flight attempts are unaffected by an unpublish and
    // keep counting. This route previously did the opposite: it flipped the status and left them
    // stranded behind the `status === "published"` gate on GET/POST, where the client could neither
    // fetch, submit, nor reach the time-limit auto-submit.
    //
    // There is nothing to recover — answers are browser-only until POST, so any attempt reaching
    // here has nothing saved. What matters is that it is *finalised*, so it counts as an attempt.
    const openAttempts = await db
      .select({ id: quizAttempts.id, userId: quizAttempts.userId })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), isNull(quizAttempts.submittedAt)))
      .orderBy(asc(quizAttempts.id));

    // One transaction: a partial failure must not leave some attempts finalised and the quiz still
    // published. Each finalise is independently idempotent (`isNull(submittedAt)` in its WHERE), so
    // even a retry that races a student POST converges rather than double-scoring.
    const row = await db.transaction(async (tx) => {
      let finalized = 0;
      for (const attempt of openAttempts) {
        const ok = await finalizeUnsubmittedAttempt(tx, attempt.id, quizId, attempt.userId);
        if (ok) finalized += 1;
      }
      const [updated] = await tx
        .update(quizzes)
        .set({ status: "draft" })
        .where(eq(quizzes.id, quizId))
        .returning({ id: quizzes.id, status: quizzes.status });
      return { ...updated, finalizedAttempts: finalized };
    });

    return NextResponse.json(row);
  } catch (err) {
    return errorResponse(err);
  }
}
