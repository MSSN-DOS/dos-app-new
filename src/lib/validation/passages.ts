import { z } from "zod";

import { RICH_TEXT_MAX_LENGTH, nullableId, requiredRichTextSchema } from "./primitives";

/**
 * Passage — validation surface.
 *
 * A passage is a shared block of text with several ordinary questions hanging off it.
 * The questions themselves are validated by `questions.ts` / `quiz-questions.ts`; this
 * file only governs the passage body and the track it belongs to.
 *
 * Two levels, same pattern as `questionDraftSchema` / `questionPublishSchema`
 * (AGENTS.md §3): a draft may be empty, a published passage must say something.
 */

const passageFields = {
  // Mirrors the DB CHECK `passages_track_check`: a Course (optionally with a Topic)
  // or a JAMB subject, never both and never neither.
  courseId: nullableId.optional(),
  jambSubjectId: nullableId.optional(),
  topicId: nullableId.optional(),
  title: z.string().trim().max(200).optional(),
  bodyRichText: z.string().max(RICH_TEXT_MAX_LENGTH),
};

function requireSingleTrack(
  data: { courseId?: number | null; jambSubjectId?: number | null },
  ctx: z.RefinementCtx,
) {
  if (!data.courseId && !data.jambSubjectId) {
    ctx.addIssue({
      code: "custom",
      path: ["courseId"],
      message: "Pick a course or a JAMB subject for this passage",
    });
  }
  if (data.courseId && data.jambSubjectId) {
    ctx.addIssue({
      code: "custom",
      path: ["jambSubjectId"],
      message: "A passage cannot belong to both a course and a JAMB subject",
    });
  }
}

// Lenient: an empty passage saves, so a half-written one is never lost.
export const passageDraftSchema = z
  .object(passageFields)
  .superRefine((data, ctx) => requireSingleTrack(data, ctx));

export type PassageDraftInput = z.infer<typeof passageDraftSchema>;

// Strict: publishing a passage with no text would ship blank sub-questions to students.
export const passagePublishSchema = z
  .object({
    ...passageFields,
    bodyRichText: requiredRichTextSchema("Passage text is required before publishing"),
  })
  .superRefine((data, ctx) => requireSingleTrack(data, ctx));

export type PassagePublishInput = z.infer<typeof passagePublishSchema>;
