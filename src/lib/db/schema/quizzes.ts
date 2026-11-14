import {
  pgTable,
  boolean,
  check,
  date,
  integer,
  numeric,
  serial,
  text,
  timestamp,
  varchar,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  quizTypeEnum,
  contentStatusEnum,
  loseFocusPolicyEnum,
  quizVisibilityEnum,
  reviewPolicyEnum,
} from "./enums";
import { courses, topics } from "./courses";
import { jambSubjects } from "./jamb";
import { users } from "./auth";
import { questions, questionOptions } from "./questions";
import { denyPublicPolicy } from "./rls";

export const quizzes = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    coverImagePath: varchar("cover_image_path", { length: 500 }),
    builderRevision: integer("builder_revision").notNull().default(0),
    scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
    instructions: text("instructions"),
    quizType: quizTypeEnum("quiz_type").notNull(),
    courseId: integer("course_id").references(() => courses.id),
    topicId: integer("topic_id").references(() => topics.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    weekStart: date("week_start"),
    // Admin-controlled availability override for Course Quizzes. Both NULL = the
    // default Saturday 00:00 -> Monday 00:00 WAT window derived from week_start.
    // Setting either one replaces that boundary; see isCourseQuizWindowOpen() and
    // DESIGN.md 4 decision 6 (was "Fixed" before Board override 2026-09-28).
    opensAt: timestamp("opens_at", { mode: "date" }),
    closesAt: timestamp("closes_at", { mode: "date" }),
    questionCount: integer("question_count").notNull().default(50),
    // Deprecated: seconds is the only granularity the builder writes now, because the
    // duration control has hour/minute/second selects. Nullable since 0011 so optional
    // duration is stored honestly; timed quizzes still populate rounded-up minutes.
    timeLimitMinutes: integer("time_limit_minutes"),
    // Null means "no time limit". NULL on rows created before migration 0010 could not
    // happen — they were backfilled from time_limit_minutes * 60.
    timeLimitSeconds: integer("time_limit_seconds"),
    passMark: integer("pass_mark").notNull(),
    allowMultipleAttempts: boolean("allow_multiple_attempts")
      .notNull()
      .default(false),

    // --- Authoring settings (P12) -------------------------------------------------
    visibility: quizVisibilityEnum("visibility").notNull().default("private"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    // Resume an interrupted attempt instead of being handed a fresh one.
    allowResume: boolean("allow_resume").notNull().default(true),
    autoNextQuestion: boolean("auto_next_question").notNull().default(false),
    // Defaults to true: the app has no anonymous attempt path anywhere, so a quiz that
    // claims to be attemptable signed-out would be a lie rather than a setting.
    requireLoginToAttempt: boolean("require_login_to_attempt")
      .notNull()
      .default(true),
    showAnswersAfter: reviewPolicyEnum("show_answers_after")
      .notNull()
      .default("after_release"),
    showResultAfter: reviewPolicyEnum("show_result_after")
      .notNull()
      .default("after_release"),
    showCalculator: boolean("show_calculator").notNull().default(false),
    deductMarksForWrong: boolean("deduct_marks_for_wrong")
      .notNull()
      .default(false),

    loseFocusPolicy: loseFocusPolicyEnum("lose_focus_policy")
      .notNull()
      .default("ignore"),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [
    check(
      "quizzes_track_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`
    ),
    check(
      "quizzes_type_check",
      sql`(quiz_type = 'topic' AND topic_id IS NOT NULL AND week_start IS NULL) OR (quiz_type = 'course' AND topic_id IS NULL AND week_start IS NOT NULL)`
    ),
    check(
      "quizzes_window_check",
      sql`opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at`
    ),
    denyPublicPolicy("quizzes"),
  ]
).enableRLS();

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    // Display order inside the quiz. `question_options.sort_order` already exists for
    // options; without this the builder's drag-reorder has nothing to persist.
    sortOrder: integer("sort_order").notNull().default(0),
    // Per-question marks. Integer because marks are whole numbers throughout the app
    // (distributeMarks() splits a total without fractions); the quiz total is the sum.
    marks: integer("marks").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.quizId, table.questionId] }),
    check("quiz_questions_marks_check", sql`marks >= 0`),
    denyPublicPolicy("quiz_questions"),
  ]
).enableRLS();

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    attemptNumber: integer("attempt_number").notNull().default(1),
    score: numeric("score", { precision: 6, scale: 2 }),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { mode: "date" }),
    releasedAt: timestamp("released_at", { mode: "date" }),
    draftAnswers: jsonb("draft_answers").$type<{
      questionId: number; selectedOptionId?: number | null;
      blankAnswers?: Record<string, string> | null; essayAnswer?: string | null;
    }[]>().notNull().default([]),
  },
  () => [denyPublicPolicy("quiz_attempts")]
).enableRLS();

export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    selectedOptionId: integer("selected_option_id").references(
      () => questionOptions.id
    ),
    textAnswer: text("text_answer"),
    // Only teachers assign this for essays. NULL keeps the attempt ungraded.
    awardedMarks: integer("awarded_marks"),
    // Deliberate addition beyond the original .sql reference: multi-blank fill-in-the-gap
    // questions need one stored answer row per blank; NULL for options questions and
    // single-blank questions. See DESIGN.md §4 grading rules and STATE.md changelog.
    blankIndex: integer("blank_index"),
    isCorrect: boolean("is_correct"),
  },
  () => [denyPublicPolicy("attempt_answers")]
).enableRLS();

export const quizImages = pgTable("quiz_images", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  objectPath: varchar("object_path", { length: 500 }).notNull().unique(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, () => [denyPublicPolicy("quiz_images")]).enableRLS();
