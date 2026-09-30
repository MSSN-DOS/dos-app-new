import { z } from "zod";

/**
 * PATCH /api/admin/settings/semester — writes the single-row semester_settings
 * table (DESIGN.md §8). Manual mode is the safety net for calendar drift, so it
 * must always carry an explicit override; auto mode ignores (and clears) any.
 *
 * The override is a PAIR (semester + session), not a lone semester. `harmattan` on its own
 * cannot say whether it is 2025/26 or 2026/27, and once courses are one row per offering, a
 * semester-only override would filter out the whole session instead of one half of it. The DB
 * has the matching CHECK (`semester_settings_override_pair`); this mirrors it so a partial
 * override is a 422 with a field name rather than a constraint violation.
 */
export const semesterSettingsUpdateSchema = z
  .object({
    mode: z.enum(["auto", "manual"]),
    manualOverride: z.enum(["harmattan", "rain"]).nullish(),
    manualOverrideSessionId: z.coerce.number().int().min(1).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode !== "manual") return;
    if (!value.manualOverride) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manualOverride"],
        message: "Manual mode requires an override semester",
      });
    }
    if (value.manualOverrideSessionId === null || value.manualOverrideSessionId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manualOverrideSessionId"],
        message: "Manual mode requires an override session",
      });
    }
  });

export type SemesterSettingsUpdate = z.infer<typeof semesterSettingsUpdateSchema>;
