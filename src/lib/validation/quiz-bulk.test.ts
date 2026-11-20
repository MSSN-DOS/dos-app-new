import { describe, expect, it } from "vitest";
import { parseQuizBulk } from "./quiz-bulk";
describe("validated bulk paste", () => {
  it("creates multiple-answer and numeric questions with grading data", () => {
    expect(
      parseQuizBulk({
        type: "multi_answer",
        text: "Select primes\t*2\t4\t*3",
      }).questions[0].options?.filter((option) => option.isCorrect),
    ).toHaveLength(2);
    expect(
      parseQuizBulk({ type: "numeric", text: "Force?\t6.2\t0.1\tN" }).questions[0],
    ).toMatchObject({ numericAnswer: 6.2, numericTolerance: 0.1, numericUnit: "N" });
  });
  it("preserves exact gap answers, escapes markup and validates every row", () => {
    expect(
      parseQuizBulk({ type: "fill_in_gap", text: "<energy> [gap]\twatt|W" }).questions[0],
    ).toMatchObject({
      bodyRichText: "<p>&lt;energy&gt; [gap]</p>",
      blanks: [{ acceptedAnswer: "watt|W" }],
    });
    const result = parseQuizBulk({
      type: "options",
      text: "Valid\t*A\tB\nInvalid\tA\tB",
    });
    expect(result.questions).toEqual([]);
    expect(result.errors.join(" ")).toMatch(/Line 2/);
  });
  it("rejects missing gaps, missing numeric answers and excessive row counts", () => {
    for (const input of [
      { type: "fill_in_gap" as const, text: "[gap] [gap]\tone" },
      { type: "numeric" as const, text: "Value?" },
      {
        type: "essay" as const,
        text: Array.from({ length: 101 }, () => "Explain").join("\n"),
      },
    ])
      expect(parseQuizBulk(input).errors.length).toBeGreaterThan(0);
  });
});
