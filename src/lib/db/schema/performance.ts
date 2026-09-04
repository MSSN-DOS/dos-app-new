import { pgTable, date, integer, numeric, serial, timestamp, unique, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { quizzes } from "./quizzes";
import { denyPublicPolicy } from "./rls";

export const bestScores = pgTable(
  "best_scores",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    bestScore: numeric("best_score", { precision: 6, scale: 2 }).notNull(),
    achievedAt: timestamp("achieved_at", { mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.quizId] }),
    denyPublicPolicy("best_scores"),
  ]
).enableRLS();

export const cgpaRecords = pgTable(
  "cgpa_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    weekStart: date("week_start").notNull(),
    // 5.00 scale: percentage mean / 20, so max 5.00. Precision 5,2 kept for
    // backward compat with legacy percentage rows (100.00).
    cgpaValue: numeric("cgpa_value", { precision: 5, scale: 2 }).notNull(),
  },
  (table) => [
    unique("cgpa_records_user_week").on(table.userId, table.weekStart),
    denyPublicPolicy("cgpa_records"),
  ]
).enableRLS();

export const postUtmeScores = pgTable(
  "post_utme_scores",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    weekStart: date("week_start").notNull(),
    rawScore: numeric("raw_score", { precision: 6, scale: 2 }).notNull(),
    // numeric(5,2), not (4,2): the Board-confirmed aggregate scale is 0–100,
    // so a perfect 100 must fit (numeric(4,2) caps at 99.99). Column keeps its
    // original name for data continuity even though the scale changed.
    convertedScore50: numeric("converted_score_50", { precision: 5, scale: 2 }).notNull(),
  },
  (table) => [
    unique("post_utme_scores_user_week").on(table.userId, table.weekStart),
    denyPublicPolicy("post_utme_scores"),
  ]
).enableRLS();
