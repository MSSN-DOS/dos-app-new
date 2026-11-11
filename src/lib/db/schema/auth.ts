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
    // Students can sign in with either identifier they hold (Board decision 2026-11-10). The one
    // used at sign-up is mirrored into the matching column below, and the other is attached later
    // from /account/identifiers. Both are nullable because Teachers/Admins/Aspirants have neither,
    // and `identifier` remains the account's original sign-in value. Matric and JAMB shapes are
    // disjoint, so one unique index per column is enough to block same-type duplicates.
    matricNumber: varchar("matric_number", { length: 50 }).unique(),
    jambRegNumber: varchar("jamb_reg_number", { length: 50 }).unique(),
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
