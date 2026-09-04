import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { ownershipScope } from "@/lib/auth/ownership";
import { getDb } from "@/lib/db";
import {
  questionBlanks,
  questionOptions,
  questions,
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

// Two validation levels chosen by the request's declared status — a lenient
// schema for draft saves, a strict one for publishing (AGENTS.md §3).
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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const db = getDb();
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
    const courseId = params.get("courseId");
    const jambSubjectId = params.get("jambSubjectId");
    const type = params.get("type");
    const status = params.get("status");
    const topicId = params.get("topicId");

    const ownerQ = ownershipScope(auth);
    const conds = [
      courseId !== null ? eq(questions.courseId, Number(courseId)) : undefined,
      jambSubjectId !== null
        ? eq(questions.jambSubjectId, Number(jambSubjectId))
        : undefined,
      topicId !== null && /^\d+$/.test(topicId)
        ? eq(questions.topicId, Number(topicId))
        : undefined,
      type === "fill_in_gap" || type === "options"
        ? eq(questions.questionType, type)
        : undefined,
      status === "draft" || status === "published"
        ? eq(questions.status, status)
        : undefined,
      ownerQ !== null ? eq(questions.createdBy, ownerQ) : undefined,
    ].filter((c) => c !== undefined);

    const base = db
      .select({
        id: questions.id,
        courseId: questions.courseId,
        jambSubjectId: questions.jambSubjectId,
        topicId: questions.topicId,
        questionType: questions.questionType,
        bodyRichText: questions.bodyRichText,
        status: questions.status,
        createdBy: questions.createdBy,
        createdAt: questions.createdAt,
      })
      .from(questions);
    const rows =
      conds.length > 0
        ? await base.where(and(...conds)).orderBy(asc(questions.id))
        : await base.orderBy(asc(questions.id));

    return NextResponse.json(paginate(rows, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
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
      .insert(questions)
      .values({
        courseId: data.courseId ?? null,
        jambSubjectId: data.jambSubjectId ?? null,
        topicId: data.topicId ?? null,
        questionType: data.questionType,
        bodyRichText: data.bodyRichText,
        status: intent.intent,
        createdBy: auth.userId,
      })
      .returning();

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

    return NextResponse.json(
      { ...row, options: optionRows, blanks: blankRows },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
