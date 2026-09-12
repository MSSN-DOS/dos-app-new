import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { denyPublicPolicy } from "./rls";

export const jambSubjects = pgTable(
  "jamb_subjects",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
  },
  () => [denyPublicPolicy("jamb_subjects")]
).enableRLS();
