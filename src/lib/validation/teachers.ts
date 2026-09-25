import { z } from "zod";

// Teacher accounts are Admin-created only (DESIGN.md §7 — no self-registration).
// identifier_type is always 'staff_id' and the identifier itself is generated (STF-001, ...),
// so neither the staff ID nor the password is part of any request body.

const idList = z.array(z.coerce.number().int().min(1)).max(200);

export const teacherCreateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    courseIds: idList.optional(),
    jambSubjectIds: idList.optional(),
  })
  .superRefine((val, ctx) => {
    const total = (val.courseIds?.length ?? 0) + (val.jambSubjectIds?.length ?? 0);
    if (total === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["courseIds"],
        message:
          "Assign at least one course or JAMB subject — a teacher with none cannot author anything",
      });
    }
  });

// PATCH handles both the profile edit (name / subjects) and the deactivate toggle, so every
// field is optional — but an empty body is a mistake, not a no-op.
export const teacherUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150).optional(),
    courseIds: idList.optional(),
    jambSubjectIds: idList.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.fullName === undefined &&
      val.courseIds === undefined &&
      val.jambSubjectIds === undefined &&
      val.isActive === undefined
    ) {
      ctx.addIssue({ code: "custom", message: "Nothing to update" });
    }

    // Assignments replace as a set. Sending only one array would silently wipe the other
    // track, so require both whenever either is present.
    const touchedAssignments = val.courseIds !== undefined || val.jambSubjectIds !== undefined;
    if (touchedAssignments) {
      if (val.courseIds === undefined || val.jambSubjectIds === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["courseIds"],
          message:
            "Send courseIds and jambSubjectIds together — assignments are replaced as a set",
        });
      } else if (val.courseIds.length + val.jambSubjectIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["courseIds"],
          message: "Assign at least one course or JAMB subject",
        });
      }
    }
  });

export type TeacherCreateInput = z.infer<typeof teacherCreateSchema>;
export type TeacherUpdateInput = z.infer<typeof teacherUpdateSchema>;
