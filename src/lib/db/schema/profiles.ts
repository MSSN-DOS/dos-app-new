import {
  pgTable,
  integer,
  jsonb,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { departments, levels } from "./academic";
import { denyPublicPolicy } from "./rls";

export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    levelId: integer("level_id")
      .notNull()
      .references(() => levels.id),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [denyPublicPolicy("student_profiles")]
).enableRLS();

export const aspirantProfiles = pgTable(
  "aspirant_profiles",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    aspirationDepartmentId: integer("aspiration_department_id")
      .notNull()
      .references(() => departments.id),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [denyPublicPolicy("aspirant_profiles")]
).enableRLS();

/**
 * Per-user UI preferences that are not part of a profile: "save as my defaults" for
 * the quiz settings panel is the first one. Keyed rather than one column per setting
 * so adding a default never needs a migration, and jsonb so the value can be a
 * boolean, a number, or a small object without three tables.
 *
 * Deliberately not a settings form for the whole app — anything with business
 * meaning (role, department, level) belongs on its real table, not here.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 100 }).notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    denyPublicPolicy("user_preferences"),
  ]
).enableRLS();
