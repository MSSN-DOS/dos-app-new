import { z } from "zod";

export const topicCreateSchema = z.object({
  courseId: z.coerce.number().int().min(1),
  title: z.string().trim().min(1).max(200),
});

export const topicUpdateSchema = topicCreateSchema;

export type TopicCreateInput = z.infer<typeof topicCreateSchema>;
