import { z } from "zod";

import { RICH_TEXT_MAX_LENGTH, nullableId, requiredRichTextSchema } from "./primitives";
import { quizDetailsSchema } from "./quiz-details";
import {
  blankInputSchema,
  checkAnswerPayload,
  numericQuestionFields,
  optionInputSchema,
  questionTypeSchema,
} from "./questions";
import {
  initialQuizSettings,
  quizSettingsDraftSchema,
  quizSettingsPublishSchema,
} from "./quiz-settings";

/**
 * Quiz builder — question payload and publish gate.
 *
 * These are the questions as the *builder* sees them, which is not the same shape as
 * the question bank's schemas in `questions.ts`:
 *
 *   - no track fields — the questions inherit the quiz's course/JAMB subject, so
 *     accepting them here would let a payload disagree with its parent;
 *   - `marks` and `sortOrder` — they live on `quiz_questions`, not on `questions`;
 *   - an optional `id` — a builder row may be an existing question being reused.
 *
 * Everything that decides whether a question is *answerable* is NOT re-implemented
 * here: `checkAnswerPayload` is imported from `questions.ts`, so "exactly one correct
 * option" and "every blank needs an answer" are one rule, used by both surfaces.
 *
 * True/False needs no variant schema. It is an `options` question with exactly two
 * options and one correct, which the shared rule already requires; the two fixed
 * options are a UI preset, not a distinct stored type. Passage needs no variant
 * either: attaching `passageId` to ordinary sub-questions is the whole mechanism.
 */

const quizQuestionFields = {
  // Present when the builder row already maps to a saved question row.
  id: nullableId.optional(),
  questionType: questionTypeSchema,
  ...numericQuestionFields,
  clientKey: z.string().min(1).max(100).optional(),
  passageKey: z.string().min(1).max(100).nullable().optional(),
  passageId: nullableId.optional(),
  bodyRichText: z.string().max(RICH_TEXT_MAX_LENGTH),
  // Surfaced after the attempt when the quiz reveals answers. Never an input to
  // grading, and never a publish requirement.
  reasonRichText: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  options: z.array(optionInputSchema).optional(),
  blanks: z.array(blankInputSchema).optional(),
  // Integer, matching `quiz_questions.marks` and its `marks >= 0` CHECK. A draft may
  // sit at 0 marks; publishing may not (see below).
  marks: z.coerce.number().int().min(0).max(1000).default(1),
  // Omitted on create — the server appends. Sent explicitly after a drag reorder.
  sortOrder: z.number().int().min(0).optional(),
};

// Lenient: a half-built card saves. Empty body, empty options, 0 marks are all fine.
export const quizQuestionDraftSchema = z.object(quizQuestionFields);

export type QuizQuestionDraftInput = z.infer<typeof quizQuestionDraftSchema>;

// Strict: the question must be answerable as written, and worth something.
export const quizQuestionPublishSchema = z
  .object({
    ...quizQuestionFields,
    bodyRichText: requiredRichTextSchema("Question text is required before publishing"),
    options: z.array(optionInputSchema).default([]),
    blanks: z.array(blankInputSchema).default([]),
    // A published question worth 0 marks can never contribute to the score, which
    // silently breaks the "Apply total marks" distribution the builder promises.
    marks: z.coerce
      .number()
      .int()
      .min(1, "A published question is worth at least one mark")
      .max(1000)
      .default(1),
  })
  .superRefine((data, ctx) => checkAnswerPayload(data, ctx));

export type QuizQuestionPublishInput = z.infer<typeof quizQuestionPublishSchema>;

const builderPassageFields = {
  id: nullableId.optional(),
  clientKey: z.string().min(1).max(100),
  title: z.string().trim().max(200).default(""),
  bodyRichText: z.string().max(RICH_TEXT_MAX_LENGTH),
};
export const builderPassageDraftSchema = z.object(builderPassageFields);
export const builderPassagePublishSchema = z.object({
  ...builderPassageFields,
  bodyRichText: requiredRichTextSchema("Passage text is required before publishing"),
});

function uniqueBuilderRows(
  rows: { id?: number | null; clientKey?: string }[],
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<number>();
  const keys = new Set<string>();
  rows.forEach((row, index) => {
    if (row.id != null) {
      if (ids.has(row.id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Each saved builder row can appear only once",
        });
      ids.add(row.id);
    }
    if (row.clientKey) {
      if (keys.has(row.clientKey))
        ctx.addIssue({
          code: "custom",
          path: [index, "clientKey"],
          message: "Each builder card needs a unique key",
        });
      keys.add(row.clientKey);
    }
  });
}

/**
 * Whole-quiz payloads. Draft save accepts any number of questions (including none);
 * publishing needs at least one complete question.
 */
export const quizDraftPayloadSchema = z.object({
  details: quizDetailsSchema,
  questions: z.array(quizQuestionDraftSchema).superRefine(uniqueBuilderRows).default([]),
  passages: z.array(builderPassageDraftSchema).superRefine(uniqueBuilderRows).default([]),
  settings: quizSettingsDraftSchema.default(initialQuizSettings),
});

export type QuizDraftPayloadInput = z.infer<typeof quizDraftPayloadSchema>;

export const quizPublishPayloadSchema = z
  .object({
    details: quizDetailsSchema,
    questions: z
      .array(quizQuestionPublishSchema)
      .min(1, "Add at least one question before publishing")
      .superRefine(uniqueBuilderRows),
    passages: z
      .array(builderPassagePublishSchema)
      .superRefine(uniqueBuilderRows)
      .default([]),
    settings: quizSettingsPublishSchema.default(initialQuizSettings),
  })
  .superRefine((data, ctx) => {
    const keys = new Set(data.passages.map((p) => p.clientKey));
    data.questions.forEach((q, index) => {
      if (q.passageKey && !keys.has(q.passageKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", index, "passageKey"],
          message: "The shared passage is missing",
        });
      }
    });
    data.passages.forEach((p, index) => {
      if (!data.questions.some((q) => q.passageKey === p.clientKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["passages", index],
          message: "Add a sub-question to this passage",
        });
      }
    });
  });

export type QuizPublishPayloadInput = z.infer<typeof quizPublishPayloadSchema>;

export interface QuizPublishBlocker {
  /** Dotted path into the payload, e.g. `questions.2.options`, so the UI can focus it. */
  path: string;
  message: string;
}

/**
 * Flattens the publish schema's issues into the list the builder's blockers summary
 * renders above the save bar. Returns an empty array when the quiz is publishable, so
 * "publish is allowed" is one predicate rather than a set of hand-checked conditions
 * that drift away from the schema.
 */
export function collectQuizPublishBlockers(input: unknown): QuizPublishBlocker[] {
  const result = quizPublishPayloadSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
