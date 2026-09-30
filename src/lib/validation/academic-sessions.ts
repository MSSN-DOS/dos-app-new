import { z } from "zod";

/**
 * Academic session — one year containing a Harmattan and a Rain semester (DESIGN.md §8,
 * amended 2026-09-30). The calendar is data, not code, because a code-hardcoded calendar turns
 * every new session into a deploy and lets the app silently resolve a session that has already
 * ended.
 *
 * Dates are plain `YYYY-MM-DD` strings on purpose. A `timestamp` here would drag a timezone in:
 * the semester boundaries are calendar dates in WAT, not instants, and storing midnight-UTC
 * for "Harmattan starts" is how you get a session that starts a day early for half the world.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Not a real date");

/**
 * Strict publish-level schema. Order is checked here as well as by a DB CHECK so an Admin sees
 * a per-field error instead of a 500 from a constraint violation.
 */
const ordered = <T extends { harmattanStart: string; harmattanEnd: string; rainStart: string; rainEnd: string }>(
  value: T,
  ctx: z.RefinementCtx,
): void => {
  if (value.harmattanStart >= value.harmattanEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["harmattanEnd"],
      message: "Harmattan must end after it starts",
    });
  }
  if (value.harmattanEnd >= value.rainStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rainStart"],
      message: "Rain must start after Harmattan ends",
    });
  }
  if (value.rainStart >= value.rainEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rainEnd"],
      message: "Rain must end after it starts",
    });
  }
};

export const academicSessionCreateSchema = z
  .object({
    label: z.string().trim().regex(/^\d{4}\/\d{2}$/, "Use the form 2026/27"),
    harmattanStart: isoDate,
    harmattanEnd: isoDate,
    rainStart: isoDate,
    rainEnd: isoDate,
  })
  .strict()
  .superRefine(ordered);

export const academicSessionUpdateSchema = academicSessionCreateSchema;

export type AcademicSessionCreateInput = z.infer<typeof academicSessionCreateSchema>;
