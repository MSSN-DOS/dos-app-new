import {
  check,
  integer,
  pgTable,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { courses } from "./courses";
import { jambSubjects } from "./jamb";
import { denyPublicPolicy } from "./rls";

// What a Teacher is allowed to author. One row per (teacher, subject), where "subject" is
// either a Course (student track) or a JAMB subject (aspirant track) — never both, never
// neither, mirroring `content_items_track_check` and `quizzes_track_check`.
//
// Admin is never listed here on purpose: an Admin bypasses subject restriction entirely,
// the same way `ownershipScope` (lib/auth/ownership.ts) returns null for an Admin.
export const teacherSubjects = pgTable(
  "teacher_subjects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id").references(() => courses.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
  },
  (table) => [
    check(
      "teacher_subjects_scope_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`
    ),
    // Partial unique indexes rather than a composite PK: NULLs in a PK don't dedupe, so
    // (user, course) would allow unlimited duplicates of the same assignment.
    uniqueIndex("teacher_subjects_user_course_unique")
      .on(table.userId, table.courseId)
      .where(sql`${table.courseId} IS NOT NULL`),
    uniqueIndex("teacher_subjects_user_subject_unique")
      .on(table.userId, table.jambSubjectId)
      .where(sql`${table.jambSubjectId} IS NOT NULL`),
    denyPublicPolicy("teacher_subjects"),
  ]
).enableRLS();
