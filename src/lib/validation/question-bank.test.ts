import { describe, expect, it } from "vitest";
import { newBuilderQuestion } from "@/lib/quizzes/builder";
import { bankDraftSchema, bankPublishSchema, bankImagePathSchema } from "./question-bank";
const essay = { kind: "essay", courseId: 1, questions: [newBuilderQuestion("essay", "e")] };
describe("question-bank documents", () => {
  it("saves unfinished essays but requires text to publish", () => {
    expect(bankDraftSchema.safeParse(essay).success).toBe(true);
    expect(bankPublishSchema.safeParse(essay).success).toBe(false);
    expect(bankPublishSchema.safeParse({ ...essay, questions: [{ ...essay.questions[0], bodyRichText: "Explain the law" }] }).success).toBe(true);
  });
  it("keeps True / False single-select", () => {
    const q = { ...newBuilderQuestion("true_false", "t"), bodyRichText: "The law holds" };
    expect(bankPublishSchema.safeParse({ kind: "true_false", courseId: 1, questions: [q] }).success).toBe(false);
    q.options![0].isCorrect = true;
    expect(bankPublishSchema.safeParse({ kind: "true_false", courseId: 1, questions: [q] }).success).toBe(true);
    q.options![1].isCorrect = true;
    expect(bankPublishSchema.safeParse({ kind: "true_false", courseId: 1, questions: [q] }).success).toBe(false);
  });
  it("checks every passage child and the passage before publishing", () => {
    const q = { ...newBuilderQuestion("essay", "a", "p"), bodyRichText: "Explain" };
    const payload = { kind: "passage", jambSubjectId: 2, questions: [q], passages: [{ clientKey: "p", bodyRichText: "" }] };
    expect(bankDraftSchema.safeParse(payload).success).toBe(true);
    expect(bankPublishSchema.safeParse(payload).success).toBe(false);
    expect(bankPublishSchema.safeParse({ ...payload, passages: [{ clientKey: "p", bodyRichText: "Read this text" }] }).success).toBe(true);
    expect(bankDraftSchema.safeParse({ ...payload, questions: [{ ...q, passageKey: "foreign" }] }).success).toBe(false);
  });
  it("rejects duplicate card IDs, missing tracks and mixed tracks", () => {
    expect(bankDraftSchema.safeParse({ ...essay, courseId: null }).success).toBe(false);
    expect(bankDraftSchema.safeParse({ ...essay, jambSubjectId: 2 }).success).toBe(false);
    expect(bankDraftSchema.safeParse({ kind: "passage", courseId: 1, questions: [{ ...essay.questions[0], id: 3 }, { ...essay.questions[0], id: 3 }], passages: [] }).success).toBe(false);
  });
  it("restricts image paths to the bank namespace", () => {
    expect(bankImagePathSchema.safeParse("question-bank/1/abc-123.png").success).toBe(true);
    expect(bankImagePathSchema.safeParse("question-bank/1/../../secret.png").success).toBe(false);
  });
});
