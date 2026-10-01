/**
 * Publish-readiness rules for the quiz builder.
 *
 * WHY THIS IS A MODULE (D-4)
 * ---------------------------
 * These rules used to live inline in `quiz-builder-view.tsx`, inside a ~510-line component whose
 * cyclomatic complexity was 79 against a repository p90 of 3. The rules themselves are the part
 * most worth reading carefully — a Course Quiz that publishes with 12 questions attached is a real
 * failure — and they had **zero tests**, because they were unreachable from a test without mounting
 * a component tree.
 *
 * Pulling them out does two things at once: it breaks up the component (D-4), and it makes the rules
 * directly testable (AGENTS.md §5 — "unit test the things that have real logic and real ways to be
 * subtly wrong").
 *
 * Pure functions only. No React, no query client, no fetching.
 */

/** Course Quizzes are fixed-length by Board decision; Topic Quizzes use the author's own count. */
export const COURSE_QUIZ_QUESTION_COUNT = 50;

/** Bounds shared by the Zod schemas in `src/lib/validation/`. Duplicated deliberately: see below. */
const QUESTION_COUNT_RANGE = { min: 1, max: 100 } as const;
const TIME_LIMIT_RANGE = { min: 1, max: 600 } as const;
const PASS_MARK_RANGE = { min: 1, max: 100 } as const;

/**
 * Why these bounds are repeated rather than imported.
 *
 * `src/lib/validation/` owns the schemas, and the server is the authority on what is valid. But a
 * builder that only learns about a bad time limit after a round-trip gives the teacher a bad time,
 * and one that uses the *server's* range would change meaning if the server's range changed —
 * silently. So the builder states its own bounds and this comment records that the two must be
 * kept in step. If you change one, change the other, and the tests here pin the client side.
 */

/** Raw form values, exactly as the `<input>`s hold them — strings, possibly blank or half-typed. */
export type BuilderForm = {
  title: string;
  instructions: string;
  questionCount: string;
  timeLimit: string;
  passMark: string;
  allowMultipleAttempts: boolean;
  loseFocusPolicy: "ignore" | "warn" | "auto_submit";
  weekStart: string;
  quizType: "topic" | "course";
};

/** How many questions must be attached before this quiz can publish. */
export function requiredQuestionCount(form: BuilderForm, attachedCount: number): number {
  void attachedCount;
  return form.quizType === "course" ? COURSE_QUIZ_QUESTION_COUNT : numberOrZero(form.questionCount);
}

/**
 * Every reason this quiz cannot publish, in the order a teacher should fix them.
 *
 * This doubles as the single source of truth for whether the quiz *can* publish: an empty array
 * means ready. It used to be possible for these two to disagree — `configValid` and `blockers` were
 * separate expressions over the same fields, and they did drift. Now there is one list.
 *
 * Note what is deliberately **not** here: a draft quiz is always saveable. These gate publishing
 * only, so an Admin editing a half-built quiz is never blocked from saving their work.
 */
export function publishBlockers(form: BuilderForm, attachedCount: number): string[] {
  const blockers: string[] = [];

  if (form.title.trim() === "") blockers.push("Give the quiz a title");

  const count = Number(form.questionCount);
  if (!isIntInRange(count, QUESTION_COUNT_RANGE)) {
    blockers.push("Question count must be between 1 and 100");
  }

  const time = Number(form.timeLimit);
  if (!isIntInRange(time, TIME_LIMIT_RANGE)) {
    blockers.push("Time limit must be between 1 and 600 minutes");
  }

  const pass = Number(form.passMark);
  if (!isIntInRange(pass, PASS_MARK_RANGE)) {
    blockers.push("Pass mark must be between 1 and 100 percent");
  }

  // Course Quizzes are scheduled against a specific week's leaderboard, so the week start is not
  // optional for them. Topic Quizzes have no week and no leaderboard, so they have nothing to
  // schedule against.
  if (form.quizType === "course" && !isIsoDate(form.weekStart)) {
    blockers.push("Pick a Saturday week start date");
  }

  const required = requiredQuestionCount(form, attachedCount);
  if (attachedCount < required) {
    blockers.push(
      `Attach ${Math.max(0, required - attachedCount)} more question(s) (${attachedCount} of ${required})`,
    );
  }

  return blockers;
}

/** Progress toward the publish threshold, as a whole percentage. */
export function attachProgress(form: BuilderForm, attachedCount: number): number {
  const required = requiredQuestionCount(form, attachedCount);
  return Math.min(100, Math.round((attachedCount / Math.max(1, required)) * 100));
}

/**
 * The PATCH body for "Save as draft".
 *
 * `weekStart` is included for Course Quizzes and omitted for Topic Quizzes, matching the column
 * being nullable rather than storing a meaningless empty string.
 */
export function buildQuizPatch(form: BuilderForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    instructions: form.instructions.trim(),
    questionCount: Number(form.questionCount),
    timeLimitMinutes: Number(form.timeLimit),
    passMark: Number(form.passMark),
    allowMultipleAttempts: form.allowMultipleAttempts,
    loseFocusPolicy: form.loseFocusPolicy,
  };
  if (form.quizType === "course") body.weekStart = form.weekStart;
  return body;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function isIntInRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function numberOrZero(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}