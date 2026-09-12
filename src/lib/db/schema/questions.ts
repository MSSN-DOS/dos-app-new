import {
  pgTable,
  boolean,
  check,
  integer,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { questionTypeEnum, contentStatusEnum } from "./enums";
import { courses, topics } from "./courses";
import { jambSubjects } from "./jamb";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").references(() => courses.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    topicId: integer("topic_id").references(() => topics.id),
    questionType: questionTypeEnum("question_type").notNull(),
    bodyRichText: text("body_rich_text").notNull(),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [
    check(
      "questions_track_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`
    ),
    denyPublicPolicy("questions"),
  ]
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
  () => [denyPublicPolicy("question_options")]
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
  () => [denyPublicPolicy("question_blanks")]
).enableRLS();
