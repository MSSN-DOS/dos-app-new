import { describe, expect, it } from "vitest";
import { gradeWeightedAttempt, type WeightedGradingQuestion } from "./weighted-attempt";
const option = (id: number, marks: number): WeightedGradingQuestion => ({ id, marks, questionType: "options", options: [{ id: id * 10, isCorrect: true }, { id: id * 10 + 1, isCorrect: false }], blanks: [] });
const answer = (questionId: number, selectedOptionId: number | null) => ({ questionId, selectedOptionId, blankAnswers: {} });
describe("marks-based grading", () => {
  it("weights questions by configured marks", () => {
    expect(gradeWeightedAttempt([option(1, 9), option(2, 1)], [answer(1, 10), answer(2, 21)]).score).toBe(90);
  });
  it("deducts full marks only for answered wrong questions and floors the score", () => {
    expect(gradeWeightedAttempt([option(1, 2), option(2, 8)], [answer(1, 10), answer(2, 21)], true).score).toBe(0);
    expect(gradeWeightedAttempt([option(1, 2), option(2, 8)], [answer(1, 10)], true).score).toBe(20);
  });
  it("grades all gaps exactly, trimmed and case-insensitively", () => {
    const q: WeightedGradingQuestion = { id: 1, marks: 4, questionType: "fill_in_gap", options: [], blanks: [{ blankIndex: 1, acceptedAnswer: "Ohm" }, { blankIndex: 2, acceptedAnswer: "Ampere" }] };
    expect(gradeWeightedAttempt([q], [{ questionId: 1, selectedOptionId: null, blankAnswers: { 1: " OHM ", 2: "ampere" } }]).score).toBe(100);
    const incomplete = gradeWeightedAttempt([q], [{ questionId: 1, selectedOptionId: null, blankAnswers: { 1: "ohm" } }], true);
    expect(incomplete.earnedMarks).toBe(-4);
    expect(gradeWeightedAttempt([q], [], true).earnedMarks).toBe(0);
  });
  it("keeps essays pending even when unanswered; only teacher awards complete grading", () => {
    const essay: WeightedGradingQuestion = { id: 2, marks: 5, questionType: "essay", options: [], blanks: [] };
    expect(gradeWeightedAttempt([option(1, 5), essay], [answer(1, 10)], true).score).toBeNull();
    expect(gradeWeightedAttempt([option(1, 5), essay], [answer(1, 10)], true, new Map([[2, 3]])).score).toBe(80);
    expect(() => gradeWeightedAttempt([essay], [], false, new Map([[2, 6]]))).toThrow();
  });
});
