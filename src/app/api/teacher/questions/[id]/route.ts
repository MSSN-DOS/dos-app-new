import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth, type AuthContext } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import {
  attemptAnswers,
  questionBlanks,
  questionOptions,
  questions,
  quizQuestions,
} from "@/lib/db/schema";
import {
  questionDraftSchema,
  questionPublishSchema,
} from "@/lib/validation/questions";

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

function parseIntents(raw: unknown):
  | { ok: true; intent: "draft" | "published" }
  | { ok: false } {
  const status =
    typeof raw === "object" && raw !== null && "status" in raw
      ? (raw as { status?: unknown }).status
      : undefined;
  if (status === "published") return { ok: true, intent: "published" };
  if (status === undefined || status === "draft") return { ok: true, intent: "draft" };
  return { ok: false };
}

function parseId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

// Teachers only see/edit their own bank entries; admins see everything.
function ownedWhere(auth: AuthContext) {
  const scope = ownershipScope(auth);
  return scope === null ? undefined : eq(questions.createdBy, scope);
}

export async function GET(
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
    const [row] = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, id), ownedWhere(auth)))
      .orderBy(asc(questions.id));
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Question not found" } },
        { status: 404 },
      );
    }

    const options = await db
      .select()
      .from(questionOptions)
      .where(eq(questionOptions.questionId, id))
      .orderBy(asc(questionOptions.sortOrder));
    const blanks = await db
      .select()
      .from(questionBlanks)
      .where(eq(questionBlanks.questionId, id))
      .orderBy(asc(questionBlanks.blankIndex));

    return NextResponse.json({ ...row, options, blanks });
  } catch (err) {
    return errorResponse(err);
  }
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

    const raw = await request.json();
    const intent = parseIntents(raw);
    if (!intent.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              { field: "status", code: "invalid_value", message: "Status must be draft or published" },
            ],
          },
        },
        { status: 422 },
      );
    }
    const data =
      intent.intent === "published"
        ? questionPublishSchema.parse(raw)
        : questionDraftSchema.parse(raw);

    const db = getDb();
    const [row] = await db
      .update(questions)
      .set({
        courseId: data.courseId ?? null,
        jambSubjectId: data.jambSubjectId ?? null,
        topicId: data.topicId ?? null,
        questionType: data.questionType,
        bodyRichText: data.bodyRichText,
        status: intent.intent,
      })
      .where(and(eq(questions.id, id), ownedWhere(auth)))
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Question not found" } },
        { status: 404 },
      );
    }

    // Options/blanks are set-replaced on every save.
    await db.delete(questionOptions).where(eq(questionOptions.questionId, id)).returning();
    await db.delete(questionBlanks).where(eq(questionBlanks.questionId, id)).returning();

    const optionRows =
      data.questionType === "options" && data.options && data.options.length > 0
        ? await db
            .insert(questionOptions)
            .values(
              data.options.map((o, i) => ({
                questionId: row.id,
                optionText: o.optionText.trim(),
                isCorrect: o.isCorrect,
                sortOrder: i,
              })),
            )
            .returning()
        : [];

    const blankRows =
      data.questionType === "fill_in_gap" && data.blanks && data.blanks.length > 0
        ? await db
            .insert(questionBlanks)
            .values(
              data.blanks.map((b, i) => ({
                questionId: row.id,
                blankIndex: i + 1,
                acceptedAnswer: b.acceptedAnswer.trim(),
              })),
            )
            .returning()
        : [];

    return NextResponse.json({ ...row, options: optionRows, blanks: blankRows });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

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
    // Ownership first — don't reveal reference-block details for another teacher's rows.
    const [exists] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.id, id), ownedWhere(auth)))
      .orderBy(asc(questions.id));
    if (!exists) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Question not found" } },
        { status: 404 },
      );
    }

    // Reference blocks in order: quiz attachments first, then recorded answers.
    const attached = await db
      .select({ quizId: quizQuestions.quizId })
      .from(quizQuestions)
      .where(eq(quizQuestions.questionId, id))
      .orderBy(asc(quizQuestions.quizId));
    if (attached.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Question is attached to one or more quizzes and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const answered = await db
      .select({ attemptId: attemptAnswers.attemptId })
      .from(attemptAnswers)
      .where(eq(attemptAnswers.questionId, id))
      .orderBy(asc(attemptAnswers.attemptId));
    if (answered.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Question has one or more recorded answers and cannot be deleted",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .delete(questions)
      .where(and(eq(questions.id, id), ownedWhere(auth)))
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Question not found" } },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
