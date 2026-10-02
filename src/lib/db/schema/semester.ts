import {
  pgTable,
  check,
  integer,
  smallint,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { semesterEnum, semesterModeEnum } from "./enums";
import { academicSessions } from "./academic-sessions";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const semesterSettings = pgTable(
  "semester_settings",
  {
    id: smallint("id").primaryKey().default(1),
    mode: semesterModeEnum("mode").notNull().default("auto"),
    // A manual override is a *pair*: a semester is meaningless without the session it belongs
    // to, since 'harmattan' alone cannot say whether it is 2025/26 or 2026/27. The CHECK keeps
    // the pair together so no row can be half-set, and clears both in auto mode so a stale
    // override never sits in the table implying it is in force.
    manualOverride: semesterEnum("manual_override"),
    manualOverrideSessionId: integer("manual_override_session_id").references(
      () => academicSessions.id,
    ),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id),
  },
  () => [
    check("semester_settings_single_row", sql`id = 1`),
    check(
      "semester_settings_override_pair",
      sql`(mode = 'manual' AND manual_override IS NOT NULL AND manual_override_session_id IS NOT NULL)
        OR (mode = 'auto' AND manual_override IS NULL AND manual_override_session_id IS NULL)`,
    ),
    denyPublicPolicy("semester_settings"),
  ]
).enableRLS();
