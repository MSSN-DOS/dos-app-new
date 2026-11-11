import { z } from "zod";

import { identifierTypeFor, jambRegNumberSchema } from "./identifiers";

// Registration payload. The identifier format is validated against the role the caller chose:
// a Student may supply either a Matric number or a JAMB registration number (Board decision
// 2026-11-10 — whichever they hold today; the other can be attached later from
// /account/identifiers), an Aspirant must supply a JAMB registration number. This keeps the
// single source of truth (identifiers.ts) and avoids any second copy of the regexes.
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    identifier: z.string().trim(),
    password: z.string().min(8).max(72),
    role: z.enum(["student", "aspirant"]),
  })
  .superRefine((val, ctx) => {
    if (val.role === "student") {
      if (identifierTypeFor(val.identifier) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["identifier"],
          message:
            "Enter a valid Matric Number (YY/FF/DD###, e.g. 21/30GN019) or JAMB Registration Number (4-digit year + 8 digits + 2 letters, e.g. 202612345678AB)",
        });
      }
      return;
    }

    const result = jambRegNumberSchema.safeParse(val.identifier);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message: result.error.issues[0]?.message ?? "Invalid JAMB registration number",
      });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().trim(),
  password: z.string().min(1),
});

// Attaching the second identifier to an existing Student account. The shape decides which column
// fills, so a bad value has to fail here rather than reach the route unresolved.
export const addIdentifierSchema = z
  .object({
    identifier: z.string().trim().min(1, "Enter the identifier you want to add"),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (identifierTypeFor(val.identifier) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message:
          "Enter a valid Matric Number (YY/FF/DD###, e.g. 21/30GN019) or JAMB Registration Number (4-digit year + 8 digits + 2 letters, e.g. 202612345678AB)",
      });
    }
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
export type AddIdentifierInput = z.infer<typeof addIdentifierSchema>;
