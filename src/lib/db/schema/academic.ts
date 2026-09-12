import { pgTable, serial, varchar, integer, primaryKey } from "drizzle-orm/pg-core";
import { denyPublicPolicy } from "./rls";

export const levels = pgTable(
  "levels",
  {
    id: serial("id").primaryKey(),
    value: integer("value").notNull().unique(),
  },
  () => [denyPublicPolicy("levels")]
).enableRLS();

export const faculties = pgTable(
  "faculties",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull().unique(),
  },
  () => [denyPublicPolicy("faculties")]
).enableRLS();

export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => faculties.id),
    name: varchar("name", { length: 150 }).notNull(),
  },
  () => [denyPublicPolicy("departments")]
).enableRLS();

export const departmentLevels = pgTable(
  "department_levels",
  {
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    levelId: integer("level_id")
      .notNull()
      .references(() => levels.id),
  },
  (table) => [
    primaryKey({ columns: [table.departmentId, table.levelId] }),
    denyPublicPolicy("department_levels"),
  ]
).enableRLS();
