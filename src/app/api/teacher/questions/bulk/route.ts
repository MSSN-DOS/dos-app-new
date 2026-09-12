import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
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

const BULK_LIMIT = 50;

const bulkShape = z.object({
  questions: z
    .array(z.unknown())
    .min(1, "Provide at least one question")
    .max(BULK_LIMIT, `A maximum of ${BULK_LIMIT} questions per batch`),
});

// Two validation levels chosen by each item's declared status (AGENTS.md §3):
// lenient for draft saves, strict for publishing.
function parseIntent(raw: unknown): "draft" | "published" | null {
  const status =
    typeof raw === "object" && raw !== null && "status" in raw
      ? (raw as { status?: unknown }).status
      : undefined;
  if (status === "published") return "published";
  if (status === undefined || status === "draft") return "draft";
  return null;
}

function issueDetails(err: ZodError, prefix: string) {
  return err.issues.map((i) => ({
    field: i.path.length > 0 ? `${prefix}.${i.path.join(".")}` : prefix,
    code: i.code,
    message: i.message,
  }));
}

// Bulk question creation: every item is validated up front and the whole batch
// inserts inside one transaction, so a single bad row rejects the batch with a
// 422 naming the offending row(s) instead of leaving a partial write behind.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const raw = await request.json();
    const shape = bulkShape.safeParse(raw);
    if (!shape.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: issueDetails(shape.error, "body"),
          },
        },
        { status: 422 },
      );
    }

    const items = shape.data.questions;
    const problems: {
      field: string;
      code: string;
      message: string;
    }[] = [];

    // Phase 1 — validate everything before writing anything.
    const parsed = items.map((item, i) => {
      const intent = parseIntent(item);
      if (intent === null) {
        problems.push({
          field: `questions.${i}.status`,
          code: "invalid_value",
          message: "Status must be draft or published",
        });
        return null;
      }
      const result =
        intent === "published"
          ? questionPublishSchema.safeParse(item)
          : questionDraftSchema.safeParse(item);
      if (!result.success) {
        problems.push(...issueDetails(result.error, `questions.${i}`));
        return null;
      }
      return { intent, data: result.data };
    });

    if (problems.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: problems,
          },
        },
        { status: 422 },
      );
    }

    const db = getDb();
    const created = await db.transaction(async (tx) => {
      const rows: (typeof questions.$inferSelect & {
        options: (typeof questionOptions.$inferSelect)[];
        blanks: (typeof questionBlanks.$inferSelect)[];
      })[] = [];
      for (const entry of parsed) {
        if (entry === null) continue; // already rejected above — unreachable
        const { intent, data } = entry;
        const [row] = await tx
          .insert(questions)
          .values({
            courseId: data.courseId ?? null,
            jambSubjectId: data.jambSubjectId ?? null,
            topicId: data.topicId ?? null,
            questionType: data.questionType,
            bodyRichText: data.bodyRichText,
            status: intent,
            createdBy: auth.userId,
          })
          .returning();

        const optionRows =
          data.questionType === "options" &&
          data.options &&
          data.options.length > 0
            ? await tx
                .insert(questionOptions)
                .values(
                  data.options.map((o, oi) => ({
                    questionId: row.id,
                    optionText: o.optionText.trim(),
                    isCorrect: o.isCorrect,
                    sortOrder: oi,
                  })),
                )
                .returning()
            : [];

        const blankRows =
          data.questionType === "fill_in_gap" &&
          data.blanks &&
          data.blanks.length > 0
            ? await tx
                .insert(questionBlanks)
                .values(
                  data.blanks.map((b, bi) => ({
                    questionId: row.id,
                    blankIndex: bi + 1,
                    acceptedAnswer: b.acceptedAnswer.trim(),
                  })),
                )
                .returning()
            : [];

        rows.push({ ...row, options: optionRows, blanks: blankRows });
      }
      return rows;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: issueDetails(err, "body"),
          },
        },
        { status: 422 },
      );
    }
    return errorResponse(err);
  }
}
