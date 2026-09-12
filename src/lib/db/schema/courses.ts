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
    semester: semesterEnum("semester").notNull(),
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
