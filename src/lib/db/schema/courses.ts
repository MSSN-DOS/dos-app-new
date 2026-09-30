import {
  pgTable,
  check,
  integer,
  serial,
  varchar,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { semesterEnum, scopeTypeEnum } from "./enums";
import { academicSessions } from "./academic-sessions";
import { levels, faculties, departments } from "./academic";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    levelId: integer("level_id")
      .notNull()
      .references(() => levels.id),
    // Model B: this row is one *offering* of a course, not the course itself. `code` + `title`
    // describe the subject; `sessionId` + `semester` say when it is offered. Re-offering CSC 201
    // next session is a new row, so quizzes, content and attempts stay bound to the offering
    // they belong to — a 2025/26 result must not be relabelled 2026/27 (DESIGN.md §8, amended
    // 2026-09-30). There is no DB uniqueness on courses; the API enforces
    // code + level + session + semester and returns 409 on a clash.
    semester: semesterEnum("semester").notNull(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => academicSessions.id),
    scopeType: scopeTypeEnum("scope_type").notNull(),
    departmentId: integer("department_id").references(() => departments.id),
    facultyId: integer("faculty_id").references(() => faculties.id),
  },
  () => [
    check(
      "courses_scope_check",
      sql`(scope_type = 'department' AND department_id IS NOT NULL AND faculty_id IS NULL) OR (scope_type = 'faculty' AND faculty_id IS NOT NULL AND department_id IS NULL) OR (scope_type IN ('general', 'interfaculty') AND department_id IS NULL AND faculty_id IS NULL)`
    ),
    denyPublicPolicy("courses"),
  ]
).enableRLS();

export const courseFaculties = pgTable(
  "course_faculties",
  {
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => faculties.id),
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.facultyId] }),
    denyPublicPolicy("course_faculties"),
  ]
).enableRLS();

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [denyPublicPolicy("topics")]
).enableRLS();
