import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { quizAttempts, quizzes } from "@/lib/db/schema";

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

    const [row] = await db
      .update(quizzes)
      .set({ status: "draft" })
      .where(eq(quizzes.id, quizId))
      .returning({ id: quizzes.id, status: quizzes.status });

    return NextResponse.json(row);
  } catch (err) {
    return errorResponse(err);
  }
}
