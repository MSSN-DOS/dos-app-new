import { pgTable, serial, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import {
  roleNameEnum,
  identifierTypeEnum,
} from "./enums";
import { denyPublicPolicy } from "./rls";

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: roleNameEnum("name").notNull().unique(),
  },
  () => [denyPublicPolicy("roles")]
).enableRLS();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    identifier: varchar("identifier", { length: 50 }).notNull().unique(),
    identifierType: identifierTypeEnum("identifier_type").notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  () => [denyPublicPolicy("users")]
).enableRLS();

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  },
  () => [denyPublicPolicy("sessions")]
).enableRLS();
