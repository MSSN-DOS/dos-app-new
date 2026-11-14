import { z } from "zod";

export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int().min(1),
        selectedOptionId: z.coerce.number().int().min(1).nullish(),
        /** Submitted text keyed by blank index ("1", "2", ...) for fill_in_gap questions. */
        blankAnswers: z
          .record(z.string().regex(/^\d+$/), z.string().max(255))
          .nullish(),
        essayAnswer: z.string().max(20000).nullish(),
      })
    )
    .min(1)
    .superRefine((answers, ctx) => {
      if (new Set(answers.map((answer) => answer.questionId)).size !== answers.length) ctx.addIssue({ code: "custom", message: "Submit each question once" });
    }),
});

export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type SubmittedAnswerInput = SubmitAttemptInput["answers"][number];
