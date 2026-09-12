import { integer, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const tourCompletions = pgTable(
  "tour_completions",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    tourKey: varchar("tour_key", { length: 80 }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tourKey] }), denyPublicPolicy("tour_completions")]
).enableRLS();
