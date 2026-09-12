import {
  pgTable,
  check,
  integer,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { contentTypeEnum } from "./enums";
import { courses } from "./courses";
import { jambSubjects } from "./jamb";
import { users } from "./auth";
import { denyPublicPolicy } from "./rls";

export const contentItems = pgTable(
  "content_items",
  {
    id: serial("id").primaryKey(),
    type: contentTypeEnum("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    bodyOrFileUrl: text("body_or_file_url").notNull(),
    courseId: integer("course_id").references(() => courses.id),
    jambSubjectId: integer("jamb_subject_id").references(() => jambSubjects.id),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  () => [
    check(
      "content_items_track_check",
      sql`(course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)`
    ),
    denyPublicPolicy("content_items"),
  ]
).enableRLS();
