import { describe, expect, it } from "vitest";
import { numericAnswerIsCorrect, parseNumericAnswer } from "./numeric-answer";
import { gradeWeightedAttempt, type WeightedGradingQuestion } from "./weighted-attempt";
import {
  quizQuestionDraftSchema,
  quizQuestionPublishSchema,
} from "@/lib/validation/quiz-questions";
import { hasAttemptRemaining } from "@/lib/quizzes/attempt-limit";

const multi: WeightedGradingQuestion = {
  id: 1,
  questionType: "multi_answer",
  marks: 4,
  blanks: [],
  options: [
    { id: 11, isCorrect: true },
    { id: 12, isCorrect: false },
    { id: 13, isCorrect: true },
  ],
};
const numeric: WeightedGradingQuestion = {
  id: 2,
  questionType: "numeric",
  marks: 2,
  blanks: [],
  options: [],
  numericAnswer: 6,
  numericTolerance: 0.01,
};
const answer = (ids: number[], value = "6") => [
  { questionId: 1, selectedOptionId: null, selectedOptionIds: ids, blankAnswers: {} },
  { questionId: 2, selectedOptionId: null, numericAnswer: value, blankAnswers: {} },
];

describe("expanded objective grading", () => {
  it("requires the exact set, independent of order", () => {
    expect(gradeWeightedAttempt([multi, numeric], answer([13, 11])).score).toBe(100);
    for (const ids of [[11], [11, 12, 13], [11, 11], [11, 99]])
      expect(gradeWeightedAttempt([multi], answer(ids)).score).toBe(0);
  });
  it("deducts full question marks, skips unanswered questions and floors scores", () => {
    expect(
      gradeWeightedAttempt([multi, numeric], answer([12], "wrong"), true),
    ).toMatchObject({ score: 0, earnedMarks: -6 });
    expect(gradeWeightedAttempt([multi, numeric], [], true)).toMatchObject({
      score: 0,
      earnedMarks: 0,
    });
  });
  it("accepts decimal/scientific numbers and inclusive positive/negative tolerances", () => {
    expect(parseNumericAnswer(" -1.2e-3 ")).toBe(-0.0012);
    expect(numericAnswerIsCorrect("6.01", 6, 0.01)).toBe(true);
    expect(numericAnswerIsCorrect("-6.01", -6, 0.01)).toBe(true);
    expect(numericAnswerIsCorrect("6.011", 6, 0.01)).toBe(false);
    expect(numericAnswerIsCorrect("0", 0)).toBe(true);
  });
  it("rejects incomplete, nonfinite and nondecimal inputs", () => {
    for (const value of ["", " ", "NaN", "Infinity", "0x10", "2 mol", "1e500", "1e"])
      expect(parseNumericAnswer(value)).toBeNull();
    expect(numericAnswerIsCorrect("6", 6, -1)).toBe(false);
  });
});

describe("new publish rules and attempt limits", () => {
  const options = [
    { optionText: "A", isCorrect: true },
    { optionText: "B", isCorrect: true },
  ];
  it("allows multiple correct options only for the new type", () => {
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "multi_answer",
        bodyRichText: "Select all",
        options,
      }).success,
    ).toBe(true);
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "options",
        bodyRichText: "Pick one",
        options,
      }).success,
    ).toBe(false);
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "multi_answer",
        bodyRichText: "Select all",
        options: options.map((o) => ({ ...o, isCorrect: false })),
      }).success,
    ).toBe(false);
  });
  it("allows unfinished numeric drafts and requires a finite answer to publish", () => {
    const draft = {
      questionType: "numeric",
      bodyRichText: "Calculate force",
      numericAnswer: null,
    };
    expect(quizQuestionDraftSchema.safeParse(draft).success).toBe(true);
    expect(quizQuestionPublishSchema.safeParse(draft).success).toBe(false);
    expect(
      quizQuestionPublishSchema.safeParse({
        ...draft,
        numericAnswer: 0,
        numericTolerance: 0,
        numericUnit: "N",
      }).success,
    ).toBe(true);
    expect(
      quizQuestionDraftSchema.safeParse({ ...draft, numericTolerance: -1 }).success,
    ).toBe(false);
  });
  it("preserves single/unlimited defaults and enforces a configured cap", () => {
    expect(hasAttemptRemaining({ allowMultipleAttempts: false }, 1)).toBe(false);
    expect(hasAttemptRemaining({ allowMultipleAttempts: true }, 50)).toBe(true);
    expect(hasAttemptRemaining({ allowMultipleAttempts: true, maxAttempts: 3 }, 2)).toBe(
      true,
    );
    expect(hasAttemptRemaining({ allowMultipleAttempts: true, maxAttempts: 3 }, 3)).toBe(
      false,
    );
  });
});
