import { z } from "zod";

// Questions live on exactly one track — a Course (optionally within a Topic) or a
// JAMB subject, never both. Mirrors the DB CHECK `questions_track_check`.
const nullableInt = z.union([z.coerce.number().int().min(1), z.null()]);

const optionInputSchema = z.object({
  optionText: z.string().max(1000),
  isCorrect: z.boolean(),
});

const blankInputSchema = z.object({
  acceptedAnswer: z.string().max(255),
});

const questionFields = {
  questionType: z.enum(["fill_in_gap", "options"]),
  courseId: nullableInt.optional(),
  jambSubjectId: nullableInt.optional(),
  topicId: nullableInt.optional(),
  // Draft has no completeness requirements — even an empty body saves (per
  // .agents/design/screens-teacher.md). Publish enforces the real rules below.
  bodyRichText: z.string().max(20000),
  options: z.array(optionInputSchema).optional(),
  blanks: z.array(blankInputSchema).optional(),
};

function requireSingleTrack(
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
    bodyRichText: z.string().trim().min(1, "Question text is required before publishing").max(20000),
    options: z.array(optionInputSchema).default([]),
    blanks: z.array(blankInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    requireSingleTrack(data, ctx);

    if (data.questionType === "options") {
      if (data.options.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Options questions need at least two options before publishing",
        });
        return;
      }
      if (data.options.some((o) => o.optionText.trim() === "")) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Every option needs text before publishing",
        });
      }
      const correctCount = data.options.filter((o) => o.isCorrect).length;
      if (correctCount === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Mark one option as correct before publishing",
        });
      } else if (correctCount > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Only one option may be marked correct (single-select questions)",
        });
      }
    }

    if (data.questionType === "fill_in_gap") {
      if (data.blanks.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["blanks"],
          message: "Fill-in-gap questions need at least one blank before publishing",
        });
        return;
      }
      if (data.blanks.some((b) => b.acceptedAnswer.trim() === "")) {
        ctx.addIssue({
          code: "custom",
          path: ["blanks"],
          message: "Every blank needs an accepted answer before publishing",
        });
      }
    }
  });

export type QuestionPublishInput = z.infer<typeof questionPublishSchema>;
