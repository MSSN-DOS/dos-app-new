import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth, type AuthContext } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import { questions, quizzes, topics } from "@/lib/db/schema";
import { topicUpdateSchema } from "@/lib/validation/topics";

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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

function ownedWhere(auth: AuthContext) {
  const scope = ownershipScope(auth);
  return scope === null ? undefined : eq(topics.createdBy, scope);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const data = topicUpdateSchema.parse(await request.json());
    const db = getDb();
    const [row] = await db
      .update(topics)
      .set({ courseId: data.courseId, title: data.title })
      .where(and(eq(topics.id, id), ownedWhere(auth)))
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Topic not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

// Topics are never hard-deleted while referenced — quiz/question authorship would dangle.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();
    const [exists] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.id, id), ownedWhere(auth)))
      .limit(1);
    if (!exists) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Topic not found" } },
        { status: 404 },
      );
    }

    const [quizRef] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.topicId, id))
      .limit(1);
    if (quizRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Topic has one or more quizzes and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }
    const [questionRef] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.topicId, id))
      .limit(1);
    if (questionRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Topic has one or more questions in the bank and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db.delete(topics).where(and(eq(topics.id, id), ownedWhere(auth))).returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Topic not found" } },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
