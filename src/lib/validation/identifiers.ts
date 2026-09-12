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

// JAMB Registration Number — two accepted shapes:
//   Standard (10 char): 8 digits + 2 uppercase letters  -> ^\d{8}[A-Z]{2}$
//   Expanded (14 char): 4-digit year + 8 digits + 2 uppercase letters -> ^\d{12}[A-Z]{2}$
// e.g. `12345678AB` or `202612345678AB`
export const jambRegNumberSchema = z
  .string()
  .trim()
  .regex(
    /^(\d{8}[A-Z]{2}|\d{12}[A-Z]{2})$/,
    "Invalid JAMB registration number (expected 8 digits + 2 letters, or 4-digit year + 8 digits + 2 letters)",
  );

// Discriminates which identifier type a raw string is, based on format. Used when the caller
// hasn't already declared student vs aspirant.
export function identifierTypeFor(value: string): "matric_number" | "jamb_reg_number" | null {
  if (matricNumberSchema.safeParse(value).success) return "matric_number";
  if (jambRegNumberSchema.safeParse(value).success) return "jamb_reg_number";
  return null;
}
