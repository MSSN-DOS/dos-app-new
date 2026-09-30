import {
  pgTable,
  check,
  date,
  integer,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { denyPublicPolicy } from "./rls";

/**
 * An academic session — one year, containing a Harmattan and a Rain semester.
 *
 * Named `academic_sessions` rather than `sessions` because `auth.ts` already owns `sessions`
 * (the JWT refresh-token table); the two are unrelated and the collision is silent in SQL.
 *
 * The session calendar is *data*, not code (DESIGN.md §8, amended 2026-09-30). It used to live
 * as hardcoded 2025/26 dates in `lib/semester/calendar.ts`, which meant the 2026/27 dates were
 * a code change and a deploy, and that nothing in the system could name which session a course
 * belonged to — `semesterEnum` is only `harmattan | rain`, so "2025/26 Harmattan" and
 * "2026/27 Harmattan" were indistinguishable. `courses` is one row per *offering* (Model B),
 * so `session_id` is what makes two offerings of the same course distinct rows.
 */
export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Human label, e.g. `2025/26`. The CHECK below is the only thing enforcing the shape. */
    label: text("label").notNull(),
    harmattanStart: date("harmattan_start").notNull(),
    harmattanEnd: date("harmattan_end").notNull(),
    rainStart: date("rain_start").notNull(),
    rainEnd: date("rain_end").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  // Column references come through the callback's `t` parameter, not the exported const. Using
  // `academicSessions.label` inside this array makes the table reference itself during its own
  // initialisation, which TypeScript cannot type.
  (t) => [
    unique("academic_sessions_label_key").on(t.label),
    // 'NNNN/NN' — four digits, a slash, two digits. A session label is typed by an Admin into a
    // text box, so the format is enforced here as well as in Zod, not only at the API edge.
    check(
      "academic_sessions_label_format",
      sql`label ~ '^[0-9]{4}/[0-9]{2}$'`,
    ),
    // The four dates must be in order and the two semesters must not overlap. Without this an
    // Admin could save a session where Rain ends before Harmattan starts, and the resolver
    // would silently take whichever branch it reached first.
    check(
      "academic_sessions_dates_ordered",
      sql`harmattan_start < harmattan_end
        AND harmattan_end < rain_start
        AND rain_start < rain_end`,
    ),
    denyPublicPolicy("academic_sessions"),
  ]
).enableRLS();

export type AcademicSessionRow = typeof academicSessions.$inferSelect;
