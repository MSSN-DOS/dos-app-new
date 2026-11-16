import {
  boolean,
  doublePrecision,
  pgTable,
  check,
  integer,
  serial,
  text,
  timestamp,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { questionTypeEnum, contentStatusEnum } from "./enums";
import { courses, topics } from "./courses";
import { jambSubjects } from "./jamb";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";
import { quizzes } from "./quizzes";

export const passages = pgTable(
  "passages",
  {
    id: serial("id").primaryKey(),
    builderQuizId: integer("builder_quiz_id").references((): AnyPgColumn => quizzes.id),
    // A passage lives in the same track as its sub-questions, so ownership and
    // listing rules stay identical to the question bank's.
    courseId: integer("course_id").references(() => courses.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    topicId: integer("topic_id").references(() => topics.id),
    title: varchar("title", { length: 200 }),
    bodyRichText: text("body_rich_text").notNull(),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [
    check(
      "passages_track_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`,
    ),
    denyPublicPolicy("passages"),
  ],
).enableRLS();

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    // Direct builder questions are private to their quiz; bank edits cannot mutate them.
    builderQuizId: integer("builder_quiz_id").references((): AnyPgColumn => quizzes.id),
    courseId: integer("course_id").references(() => courses.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    topicId: integer("topic_id").references(() => topics.id),
    questionType: questionTypeEnum("question_type").notNull(),
    numericAnswer: doublePrecision("numeric_answer"),
    numericTolerance: doublePrecision("numeric_tolerance").notNull().default(0),
    numericUnit: varchar("numeric_unit", { length: 60 }).notNull().default(""),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    bankRevision: integer("bank_revision").notNull().default(0),
    bodyRichText: text("body_rich_text").notNull(),
    // Optional explanation shown after the attempt when the quiz reveals answers.
    // Never sent to a client that is not allowed to see the answer key.
    reasonRichText: text("reason_rich_text"),
    // Passage questions: one shared passage, several ordinary sub-questions beneath
    // it. Sub-questions stay `options` / `fill_in_gap` rows, so no enum change.
    passageId: integer("passage_id").references(() => passages.id, {
      onDelete: "set null",
    }),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [
    check(
      "questions_track_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`,
    ),
    denyPublicPolicy("questions"),
    check("questions_numeric_tolerance_check", sql`numeric_tolerance >= 0`),
  ],
).enableRLS();

export const questionOptions = pgTable(
  "question_options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    optionText: text("option_text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  () => [denyPublicPolicy("question_options")],
).enableRLS();

export const questionBlanks = pgTable(
  "question_blanks",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    blankIndex: integer("blank_index").notNull().default(1),
    acceptedAnswer: varchar("accepted_answer", { length: 255 }).notNull(),
    caseSensitive: boolean("case_sensitive").notNull().default(false),
  },
  () => [denyPublicPolicy("question_blanks")],
).enableRLS();

// Bank images belong to the author and may be reused within their bank. Quiz
// imports copy the object so later bank edits/removal cannot change a quiz.
export const questionImages = pgTable(
  "question_images",
  {
    id: serial("id").primaryKey(),
    objectPath: varchar("object_path", { length: 500 }).notNull().unique(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [denyPublicPolicy("question_images")],
).enableRLS();
