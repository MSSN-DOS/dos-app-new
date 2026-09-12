import { z } from "zod";

// Teacher accounts are Admin-created only (DESIGN.md §7 — no self-registration).
// identifier_type is always 'staff_id' for this flow.

export const teacherCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  // DESIGN.md does not lock a staff-ID format (the wireframe shows e.g. "STF-014" but
  // states no rule). Keep it lenient until the Board decides otherwise.
  staffId: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(72),
});

export const teacherUpdateSchema = z.object({
  isActive: z.boolean(),
});

export type TeacherCreateInput = z.infer<typeof teacherCreateSchema>;
