import { z } from "zod";
import { nullableId } from "./primitives";
import { requireSingleTrack } from "./questions";
import { quizDraftPayloadSchema, quizPublishPayloadSchema } from "./quiz-questions";

export const bankQuestionKindSchema = z.enum([
  "true_false",
  "options",
  "fill_in_gap",
  "passage",
  "essay",
  "multi_answer",
  "numeric",
]);
export type BankQuestionKind = z.infer<typeof bankQuestionKindSchema>;
const fields = {
  kind: bankQuestionKindSchema,
  courseId: nullableId.default(null),
  jambSubjectId: nullableId.default(null),
  topicId: nullableId.default(null),
  questions: quizDraftPayloadSchema.shape.questions,
  passages: quizDraftPayloadSchema.shape.passages,
};
const bankObject = z.object(fields);
const optionLabel = (text: string | undefined) =>
  (text ?? "").replace(/<[^>]*>/g, "").trim();
function checkDocument(data: z.infer<typeof bankObject>, ctx: z.RefinementCtx) {
  requireSingleTrack(data, ctx);
  if (data.topicId && !data.courseId)
    ctx.addIssue({
      code: "custom",
      path: ["topicId"],
      message: "A topic requires a course",
    });
  if (data.questions.length === 0 || data.questions.length > 100)
    ctx.addIssue({
      code: "custom",
      path: ["questions"],
      message: "Add between one and 100 questions",
    });
  if (data.kind === "passage") {
    if (data.passages.length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["passages"],
        message: "Add one shared passage",
      });
    const key = data.passages[0]?.clientKey;
    if (data.questions.some((q) => !q.passageKey || q.passageKey !== key))
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Every sub-question must belong to this passage",
      });
  } else {
    if (data.questions.length !== 1 || data.passages.length)
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Add one question, or choose Passage for sub-questions",
      });
    const expected = data.kind === "true_false" ? "options" : data.kind;
    if (data.questions[0]?.questionType !== expected || data.questions[0]?.passageKey)
      ctx.addIssue({
        code: "custom",
        path: ["questions", 0, "questionType"],
        message: "Question type must match the selected card",
      });
    if (
      data.kind === "true_false" &&
      (data.questions[0]?.options?.length !== 2 ||
        optionLabel(data.questions[0]?.options?.[0]?.optionText) !== "True" ||
        optionLabel(data.questions[0]?.options?.[1]?.optionText) !== "False")
    )
      ctx.addIssue({
        code: "custom",
        path: ["questions", 0, "options"],
        message: "True / False requires the True and False options",
      });
  }
}
export const bankDraftSchema = bankObject.superRefine(checkDocument);
export const bankPublishSchema = z
  .object({
    ...fields,
    questions: quizPublishPayloadSchema.shape.questions,
    passages: quizPublishPayloadSchema.shape.passages,
  })
  .superRefine(checkDocument);
export const bankSaveSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("draft"),
    revision: z.number().int().min(0),
    payload: bankDraftSchema,
  }),
  z.object({
    action: z.literal("publish"),
    revision: z.number().int().min(0),
    payload: bankPublishSchema,
  }),
]);
export const bankDocumentSchema = z.object({
  ...fields,
  id: z.number().int().positive(),
  revision: z.number().int().min(0),
  status: z.enum(["draft", "published"]),
});
export const bankImagePathSchema = z
  .string()
  .max(500)
  .regex(/^question-bank\/\d+\/[a-f0-9-]+\.(png|jpg|webp)$/, "Invalid bank image path");
export const bankImageRemovalSchema = z.object({ path: bankImagePathSchema });
export const bankImageLinksSchema = z.array(
  z.object({ path: bankImagePathSchema, url: z.string().url() }),
);
export const bankCopySchema = z.object({ questionId: z.number().int().positive() });
export const bankCopyResultSchema = z.object({
  questions: fields.questions,
  passages: fields.passages,
});
export type BankDraft = z.infer<typeof bankDraftSchema>;
export type BankSave = z.infer<typeof bankSaveSchema>;
export type BankDocument = z.infer<typeof bankDocumentSchema>;
