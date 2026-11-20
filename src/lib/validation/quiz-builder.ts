import { z } from "zod";
import { quizDraftPayloadSchema, quizPublishPayloadSchema } from "./quiz-questions";
const revision = z.number().int().min(0);
export const quizLifecycleSchema = z.object({
  action: z.enum(["unpublish", "republish"]),
  revision,
});
export const quizBuilderSaveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), revision, payload: quizDraftPayloadSchema }),
  z.object({ action: z.literal("publish"), revision, payload: quizPublishPayloadSchema }),
]);
export type QuizBuilderSaveInput = z.infer<typeof quizBuilderSaveSchema>;
export const quizBuilderDocumentSchema = quizDraftPayloadSchema.extend({
  id: z.number().int().positive(),
  revision: z.number().int().min(0),
  quizType: z.enum(["topic", "course"]),
  status: z.enum(["draft", "published"]),
  weekStart: z.string().nullable().default(null),
  courseId: z.number().nullable().default(null),
  jambSubjectId: z.number().nullable().default(null),
  coverImageUrl: z.string().url().nullable().default(null),
  hasAttempts: z.boolean().default(false),
});
export type QuizBuilderDocument = z.infer<typeof quizBuilderDocumentSchema>;

export const manualQuizGradeSchema = z
  .object({
    attemptId: z.number().int().min(1),
    answers: z
      .array(
        z.object({
          questionId: z.number().int().min(1),
          awardedMarks: z.number().int().min(0).max(1000),
        }),
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.answers.map((a) => a.questionId)).size !== data.answers.length)
      ctx.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Grade each essay once",
      });
  });
