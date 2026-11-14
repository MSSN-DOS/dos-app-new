import { z } from "zod";
import { hasRichTextContent } from "@/lib/sanitize";

/**
 * Small shared building blocks for the quiz-authoring schemas.
 *
 * `nullableId` is the shape a foreign key takes when it comes from a form control:
 * the value, or `null` for "none". It coerces because `<select>` values arrive as
 * strings; callers that mean "none" must send `null` rather than `""`, which would
 * coerce to `0` and fail the minimum. (The pre-existing schemas in `questions.ts` and
 * `quizzes.ts` carry the same union inline; they were not refactored onto this one to
 * keep this change additive. New schemas use it so the rule lives in one place.)
 */
export const nullableId = z.union([z.coerce.number().int().min(1), z.null()]);

/**
 * Ceiling for every rich-text field (question body, explanation, description,
 * instructions, passage). Generous because HTML markup inflates plain prose, and
 * because raising a limit can never reject content that already exists.
 */
export const RICH_TEXT_MAX_LENGTH = 20000;

export function requiredRichTextSchema(message: string) {
  return z.string().trim().max(RICH_TEXT_MAX_LENGTH).refine(hasRichTextContent, message);
}
