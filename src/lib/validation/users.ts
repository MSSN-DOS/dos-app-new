import { z } from "zod";

export const studentListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  facultyId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  levelId: z.coerce.number().int().positive().optional(),
});

export const aspirantListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
});
