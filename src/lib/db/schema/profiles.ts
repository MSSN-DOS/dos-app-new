import {
  pgTable,
  integer,
  timestamp,
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
