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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  quizTypeEnum,
  contentStatusEnum,
  loseFocusPolicyEnum,
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
    instructions: text("instructions"),
    quizType: quizTypeEnum("quiz_type").notNull(),
    courseId: integer("course_id").references(() => courses.id),
    topicId: integer("topic_id").references(() => topics.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    weekStart: date("week_start"),
    questionCount: integer("question_count").notNull().default(50),
    timeLimitMinutes: integer("time_limit_minutes").notNull(),
    passMark: integer("pass_mark").notNull(),
    allowMultipleAttempts: boolean("allow_multiple_attempts")
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
  },
  (table) => [
    primaryKey({ columns: [table.quizId, table.questionId] }),
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
    textAnswer: varchar("text_answer", { length: 255 }),
    // Deliberate addition beyond the original .sql reference: multi-blank fill-in-the-gap
    // questions need one stored answer row per blank; NULL for options questions and
    // single-blank questions. See DESIGN.md §4 grading rules and STATE.md changelog.
    blankIndex: integer("blank_index"),
    isCorrect: boolean("is_correct"),
  },
  () => [denyPublicPolicy("attempt_answers")]
).enableRLS();
