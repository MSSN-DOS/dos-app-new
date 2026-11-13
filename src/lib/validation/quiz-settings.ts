import { z } from "zod";

/**
 * Quiz settings panel — validation surface.
 *
 * Two levels, same pattern as `questionDraftSchema` / `questionPublishSchema`
 * (AGENTS.md §3): a lenient draft schema that lets a half-configured panel save,
 * and a strict publish schema that refuses to ship a quiz whose scheduling or
 * answer-visibility is contradictory.
 *
 * Every field here is optional-on-the-form but persisted, so the draft schema
 * tolerates a schedule that is switched on without a start time yet.
 */

export const quizVisibilityValues = ["public", "private"] as const;
export const reviewPolicyValues = ["never", "after_attempt", "after_release"] as const;

export type QuizVisibility = (typeof quizVisibilityValues)[number];
export type ReviewPolicy = (typeof reviewPolicyValues)[number];

const settingsFields = {
  /**
   * Public quizzes are listed for every signed-in student on the quiz's track.
   * Private quizzes are unlisted and reachable only by enrolled students.
   */
  visibility: z.enum(quizVisibilityValues).default("private"),

  // Attempt rules
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  allowMultipleAttempts: z.boolean(),
  allowResume: z.boolean(),
  /** Teacher-facing toggle; persisted as `lose_focus_policy` (see `focusLossPolicyFor`). */
  permitFocusLoss: z.boolean(),
  autoNextQuestion: z.boolean(),

  // Access & visibility
  requireLoginToAttempt: z.boolean(),

  // Scoring & results
  showAnswersAfter: z.enum(reviewPolicyValues),
  showResultAfter: z.enum(reviewPolicyValues),
  showCalculator: z.boolean(),
  deductMarksForWrong: z.boolean(),

  // Scheduling — writes the same `opens_at` / `closes_at` columns the Admin
  // override uses. A Teacher-set window replaces the week_start derivation
  // (Board decision, see DESIGN.md §8).
  scheduleEnabled: z.boolean(),
  opensAt: z.coerce.date().nullable(),
  closesAt: z.coerce.date().nullable(),
};

/**
 * The three-state `loseFocusPolicy` column predates the boolean toggle. A teacher
 * who permits focus loss gets `ignore`; one who does not gets `warn` rather than
 * `auto_submit`, so a stray tab switch costs a warning, not a submitted attempt.
 */
export function focusLossPolicyFor(
  permitFocusLoss: boolean,
): "ignore" | "warn" | "auto_submit" {
  return permitFocusLoss ? "ignore" : "warn";
}

function checkWindowEndsAfterStart(
  data: { opensAt: Date | null; closesAt: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (data.opensAt != null && data.closesAt != null && data.closesAt <= data.opensAt) {
    ctx.addIssue({
      code: "custom",
      path: ["closesAt"],
      message: "The end time must be after the start time",
    });
  }
}

// Lenient: a settings panel mid-edit saves whatever it has.
export const quizSettingsDraftSchema = z
  .object(settingsFields)
  .superRefine((data, ctx) => checkWindowEndsAfterStart(data, ctx));

export type QuizSettingsDraftInput = z.infer<typeof quizSettingsDraftSchema>;

// Strict: publishing requires a coherent schedule and a window that exists when
// the teacher asked for one.
export const quizSettingsPublishSchema = z
  .object(settingsFields)
  .superRefine((data, ctx) => {
    checkWindowEndsAfterStart(data, ctx);

    if (data.scheduleEnabled && data.opensAt == null) {
      ctx.addIssue({
        code: "custom",
        path: ["opensAt"],
        message: "Pick a start date and time, or turn scheduling off",
      });
    }

    if (!data.scheduleEnabled && (data.opensAt != null || data.closesAt != null)) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduleEnabled"],
        message: "Clear the schedule dates or turn scheduling back on",
      });
    }
  });

export type QuizSettingsPublishInput = z.infer<typeof quizSettingsPublishSchema>;
