import { z } from "zod";

export const studentListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  facultyId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  levelId: z.coerce.number().int().positive().optional(),
  // Omitted means "both". Deactivated students stay in the directory by default — hiding them
  // is a filter the Admin opts into, never a silent disappearance.
  status: z.enum(["active", "inactive"]).optional(),
});

export const aspirantListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
});

// PATCH on a student is the deactivate/reactivate switch only. Editing profile fields is not a
// thing on this screen: the student owns their name, and academic placement is their own
// onboarding choice.
export const studentUpdateSchema = z.object({
  isActive: z.boolean(),
});

export const studentDeleteSchema = z.object({
  identifier: z.string().trim().min(1),
});
