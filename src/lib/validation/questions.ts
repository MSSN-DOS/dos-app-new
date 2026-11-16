import { z } from "zod";

import { RICH_TEXT_MAX_LENGTH, requiredRichTextSchema } from "./primitives";
import { hasRichTextContent } from "@/lib/sanitize";

// Questions live on exactly one track — a Course (optionally within a Topic) or a
// JAMB subject, never both. Mirrors the DB CHECK `questions_track_check`.
const nullableInt = z.union([z.coerce.number().int().min(1), z.null()]);

export const optionInputSchema = z.object({
  optionText: z.string().max(1000),
  isCorrect: z.boolean(),
});

export const blankInputSchema = z.object({
  acceptedAnswer: z.string().max(255),
});

export const questionTypeSchema = z.enum([
  "fill_in_gap",
  "options",
  "essay",
  "multi_answer",
  "numeric",
]);
export const numericQuestionFields = {
  numericAnswer: z.number().finite().nullable().default(null),
  numericTolerance: z.number().finite().min(0).default(0),
  numericUnit: z.string().trim().max(60).default(""),
  shuffleOptions: z.boolean().default(false),
};

const questionFields = {
  questionType: questionTypeSchema,
  ...numericQuestionFields,
  courseId: nullableInt.optional(),
  jambSubjectId: nullableInt.optional(),
  topicId: nullableInt.optional(),
  // Sub-questions of a shared passage carry the passage's id. The passage itself is
  // validated by `passages.ts`; a sub-question needs nothing beyond the normal rules.
  passageId: nullableInt.optional(),
  // Draft has no completeness requirements — even an empty body saves (per
  // .agents/design/screens-teacher.md). Publish enforces the real rules below.
  bodyRichText: z.string().max(RICH_TEXT_MAX_LENGTH),
  // Shown after an attempt when the quiz reveals answers. Optional at every level:
  // an explanation is a nicety, not a publish requirement.
  reasonRichText: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  options: z.array(optionInputSchema).optional(),
  blanks: z.array(blankInputSchema).optional(),
};

export function requireSingleTrack(
  data: { courseId?: number | null; jambSubjectId?: number | null },
  ctx: z.RefinementCtx,
) {
  if (!data.courseId && !data.jambSubjectId) {
    ctx.addIssue({
      code: "custom",
      path: ["courseId"],
      message: "Pick a course or a JAMB subject for this question",
    });
  }
  if (data.courseId && data.jambSubjectId) {
    ctx.addIssue({
      code: "custom",
      path: ["jambSubjectId"],
      message: "A question cannot belong to both a course and a JAMB subject",
    });
  }
}

// The publish rules for a question's answer payload, kept in one exported function so
// the quiz builder validates a different wrapper (it adds marks/order, drops track)
// with exactly the same rules instead of a second copy (AGENTS.md §1).
export function checkAnswerPayload(
  data: {
    questionType: z.infer<typeof questionTypeSchema>;
    numericAnswer?: number | null;
    options?: { optionText: string; isCorrect: boolean }[];
    blanks?: { acceptedAnswer: string }[];
  },
  ctx: z.RefinementCtx,
) {
  const options = data.options ?? [];
  const blanks = data.blanks ?? [];

  if (data.questionType === "options" || data.questionType === "multi_answer") {
    if (options.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Options questions need at least two options before publishing",
      });
      return;
    }
    if (options.some((o) => !hasRichTextContent(o.optionText))) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Every option needs text before publishing",
      });
    }
    // Single-select is the only mode that ships, so True/False needs no separate
    // rule: it is an options question with exactly two options and one correct.
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Mark one option as correct before publishing",
      });
    } else if (correctCount > 1 && data.questionType === "options") {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only one option may be marked correct (single-select questions)",
      });
    }
  }

  if (
    data.questionType === "numeric" &&
    (data.numericAnswer == null || !Number.isFinite(data.numericAnswer))
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["numericAnswer"],
      message: "Enter a finite numeric answer before publishing",
    });
  }

  if (data.questionType === "fill_in_gap") {
    if (blanks.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["blanks"],
        message: "Fill-in-gap questions need at least one blank before publishing",
      });
      return;
    }
    if (blanks.some((b) => b.acceptedAnswer.trim() === "")) {
      ctx.addIssue({
        code: "custom",
        path: ["blanks"],
        message: "Every blank needs an accepted answer before publishing",
      });
    }
  }
}

// Lenient: draft-save always succeeds structurally; only the track XOR is enforced
// (the DB would reject it anyway, better as a 422 than a 500).
export const questionDraftSchema = z
  .object(questionFields)
  .superRefine((data, ctx) => requireSingleTrack(data, ctx));

export type QuestionDraftInput = z.infer<typeof questionDraftSchema>;

// Strict: publishing is blocked until the question text and all required
// options/blanks are filled in (DESIGN.md §4, AGENTS.md §3).
export const questionPublishSchema = z
  .object({
    ...questionFields,
    bodyRichText: requiredRichTextSchema("Question text is required before publishing"),
    options: z.array(optionInputSchema).default([]),
    blanks: z.array(blankInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    requireSingleTrack(data, ctx);
    checkAnswerPayload(data, ctx);
  });

export type QuestionPublishInput = z.infer<typeof questionPublishSchema>;
