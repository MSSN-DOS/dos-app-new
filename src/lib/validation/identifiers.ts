import { z } from "zod";

// Identifier formats are locked in DESIGN.md §2. These two named Zod schemas are the single
// source of truth — reused by both the registration form (client) and the /api/auth/register
// handler (server). Never redefine the regex elsewhere.

// Matric Number: `YY/FF/DD###`
//   YY  2-digit year of entry
//   FF  2-digit faculty code
//   DD  2 uppercase letters, department code
//   ### 3-digit serial number
// e.g. `21/30GN019`
export const matricNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{2}\/\d{2}[A-Z]{2}\d{3}$/, "Invalid matric number (expected YY/FF/DD###, e.g. 21/30GN019)");

// JAMB Registration Number — one shape only (Board decision 2026-11-10):
//   4-digit year + 8 digits + 2 uppercase letters -> ^\d{12}[A-Z]{2}$
// e.g. `202612345678AB`. The older 8+2 shape was dropped everywhere, aspirants included, so
// an identifier is unambiguous between the two types (matric is the only one with slashes).
export const jambRegNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\d{12}[A-Z]{2}$/,
    "Invalid JAMB registration number (expected 4-digit year + 8 digits + 2 letters, e.g. 202612345678AB)",
  );

// Discriminates which identifier type a raw string is, based on format. Used when the caller
// hasn't already declared student vs aspirant.
export function identifierTypeFor(value: string): "matric_number" | "jamb_reg_number" | null {
  if (matricNumberSchema.safeParse(value).success) return "matric_number";
  if (jambRegNumberSchema.safeParse(value).success) return "jamb_reg_number";
  return null;
}
