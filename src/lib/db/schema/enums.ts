import { pgEnum } from "drizzle-orm/pg-core";

export const roleNameEnum = pgEnum("role_name", [
  "admin",
  "teacher",
  "student",
  "aspirant",
]);

export const identifierTypeEnum = pgEnum("identifier_type", [
  "matric_number",
  "jamb_reg_number",
  "staff_id",
]);

export const semesterEnum = pgEnum("semester", ["harmattan", "rain"]);

export const scopeTypeEnum = pgEnum("scope_type", [
  "department",
  "faculty",
  "general",
  "interfaculty",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "fill_in_gap",
  "options",
]);

export const contentStatusEnum = pgEnum("status", ["draft", "published"]);

export const quizTypeEnum = pgEnum("quiz_type", ["topic", "course"]);

export const loseFocusPolicyEnum = pgEnum("lose_focus_policy", [
  "ignore",
  "warn",
  "auto_submit",
]);

export const semesterModeEnum = pgEnum("semester_mode", ["auto", "manual"]);

export const contentTypeEnum = pgEnum("content_type", ["pdf", "article"]);
