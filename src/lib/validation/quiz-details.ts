import { z } from "zod";

import { MAX_QUIZ_DURATION_SECONDS } from "@/lib/quizzes/duration";
import { RICH_TEXT_MAX_LENGTH } from "./primitives";
import { quizVisibilityValues } from "./quiz-settings";

/**
 * Quiz details panel — validation surface.
 *
 * Deliberately one schema, not a draft/publish pair. Every field here is something the
 * database stores half-filled: `description`, `instructions` and `time_limit_seconds`
 * are nullable, and `pass_mark` has a default. The rules that genuinely block
 * publishing are cross-field — at least one question, every question complete, marks
 * that add up — and they live in `quiz-questions.ts` where the questions are.
 *
 * The title is the exception. `quizzes.title` is NOT NULL, so a save with a blank title
 * is a 500 unless it is rejected here first. Requiring it turns that into a 422, which
 * is why even "Save draft" asks for one.
 *
 * `visibility` is a details-panel control (the Public/Private tabs) whose value list is
 * shared with the settings schema.
 */

export const quizDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the quiz a title")
    .max(200, "Keep the title under 200 characters"),
  // Rich text, so the ceiling is generous: markup inflates plain prose.
  description: z.string().max(RICH_TEXT_MAX_LENGTH).nullable().default(null),
  // Shown on the student's start screen before the first attempt.
  instructions: z.string().max(RICH_TEXT_MAX_LENGTH).nullable().default(null),
  // `null` means untimed. Stored in seconds so a 90-second quiz is expressible; the
  // form's three selects are mapped through `duration.ts`, never converted inline.
  // `null` is matched first so the coercion of the number branch never sees it.
  durationSeconds: z
    .union([
      z.null(),
      z.coerce
        .number()
        .int()
        .min(1, "A time limit must be at least one second")
        .max(MAX_QUIZ_DURATION_SECONDS),
    ])
    .default(null),
  // Optional on the form, always stored: an empty field means the 60% default.
  passMark: z.coerce
    .number()
    .int()
    .min(1, "Pass mark must be at least 1%")
    .max(100, "Pass mark cannot exceed 100%")
    .default(60),
  visibility: z.enum(quizVisibilityValues).default("private"),
});

export type QuizDetailsInput = z.infer<typeof quizDetailsSchema>;
