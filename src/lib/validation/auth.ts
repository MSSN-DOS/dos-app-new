import { z } from "zod";

import { jambRegNumberSchema, matricNumberSchema } from "./identifiers";

// Registration payload. The identifier format is validated against the role the caller chose:
// a Student must supply a Matric number, an Aspirant a JAMB registration number. This keeps the
// single source of truth (identifiers.ts) and avoids any second copy of the regexes.
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    identifier: z.string().trim(),
    password: z.string().min(8).max(72),
    role: z.enum(["student", "aspirant"]),
  })
  .superRefine((val, ctx) => {
    const idSchema = val.role === "student" ? matricNumberSchema : jambRegNumberSchema;
    const result = idSchema.safeParse(val.identifier);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message: result.error.issues[0]?.message ?? "Invalid identifier for the chosen role",
      });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().trim(),
  password: z.string().min(1),
});

// Changing your own password. There is no self-service reset by design (no email/SMS for MVP),
// so knowing the current password is the only proof of ownership we have.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.currentPassword === val.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a password different from your current one",
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
