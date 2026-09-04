import { z } from "zod";

/**
 * PATCH /api/admin/settings/semester — writes the single-row semester_settings
 * table (DESIGN.md §8). Manual mode is the safety net for calendar drift, so it
 * must always carry an explicit override; auto mode ignores (and clears) any.
 */
export const semesterSettingsUpdateSchema = z
  .object({
    mode: z.enum(["auto", "manual"]),
    manualOverride: z.enum(["harmattan", "rain"]).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "manual" && !value.manualOverride) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manualOverride"],
        message: "Manual mode requires an override semester",
      });
    }
  });

export type SemesterSettingsUpdate = z.infer<typeof semesterSettingsUpdateSchema>;
