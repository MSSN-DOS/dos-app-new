import {
  pgTable,
  check,
  integer,
  smallint,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { semesterEnum, semesterModeEnum } from "./enums";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const semesterSettings = pgTable(
  "semester_settings",
  {
    id: smallint("id").primaryKey().default(1),
    mode: semesterModeEnum("mode").notNull().default("auto"),
    manualOverride: semesterEnum("manual_override"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id),
  },
  () => [
    check("semester_settings_single_row", sql`id = 1`),
    denyPublicPolicy("semester_settings"),
  ]
).enableRLS();
