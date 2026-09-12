import { describe, expect, it } from "vitest";

import {
  gradeAttempt,
  type GradingQuestion,
  type SubmittedAnswer,
} from "./grade-attempt";

function optionsQuestion(
  id: number,
  correctOptionId: number,
  optionIds = [correctOptionId, correctOptionId + 1, correctOptionId + 2]
): GradingQuestion {
  return {
    id,
    questionType: "options",
    options: optionIds.map((optionId) => ({
      id: optionId,
      isCorrect: optionId === correctOptionId,
    })),
    blanks: [],
  };
}

function gapQuestion(
  id: number,
  blanks: { blankIndex: number; acceptedAnswer: string }[]
): GradingQuestion {
  return { id, questionType: "fill_in_gap", options: [], blanks };
}

describe("gradeAttempt — options questions", () => {
  it("marks correct when the selected option is the is_correct one", () => {
    const result = gradeAttempt([optionsQuestion(1, 11)], [
      { questionId: 1, selectedOptionId: 11, blankAnswers: {} },
    ]);
    expect(result.results[0].isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("marks incorrect when a wrong option is selected", () => {
    const result = gradeAttempt([optionsQuestion(1, 11)], [
      { questionId: 1, selectedOptionId: 12, blankAnswers: {} },
    ]);
    expect(result.results[0].isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it("marks unanswered options questions incorrect", () => {
    const result = gradeAttempt([optionsQuestion(1, 11)], [
      { questionId: 1, selectedOptionId: null, blankAnswers: {} },
    ]);
    expect(result.results[0].isCorrect).toBe(false);
  });

  it("treats a data-integrity violation (no correct option) as unanswerable", () => {
    const broken: GradingQuestion = {
      id: 1,
      questionType: "options",
      options: [
        { id: 11, isCorrect: false },
        { id: 12, isCorrect: false },
      ],
      blanks: [],
    };
    const result = gradeAttempt([broken], [
      { questionId: 1, selectedOptionId: 11, blankAnswers: {} },
    ]);
    expect(result.results[0].isCorrect).toBe(false);
  });

  it("treats multiple is_correct flags as unanswerable (never awards a free point)", () => {
    const broken: GradingQuestion = {
      id: 1,
      questionType: "options",
      options: [
        { id: 11, isCorrect: true },
        { id: 12, isCorrect: true },
      ],
      blanks: [],
    };
    const result = gradeAttempt([broken], [
      { questionId: 1, selectedOptionId: 11, blankAnswers: {} },
    ]);
    expect(result.results[0].isCorrect).toBe(false);
  });
});

describe("gradeAttempt — fill in the gap questions", () => {
  it("matches case-insensitively and trimmed", () => {
    const result = gradeAttempt(
      [gapQuestion(1, [{ blankIndex: 1, acceptedAnswer: "Harmattan" }])],
      [{ questionId: 1, selectedOptionId: null, blankAnswers: { 1: "  harmATTAN  " } }]
    );
    expect(result.results[0].isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("requires every blank of a multi-blank question to be correct (no partial credit)", () => {
    const question = gapQuestion(2, [
      { blankIndex: 1, acceptedAnswer: "north" },
      { blankIndex: 2, acceptedAnswer: "east" },
    ]);

    const allCorrect = gradeAttempt([question], [
      { questionId: 2, selectedOptionId: null, blankAnswers: { 1: "North ", 2: "EAST" } },
    ]);
    expect(allCorrect.results[0].isCorrect).toBe(true);

    const oneWrong = gradeAttempt([question], [
      { questionId: 2, selectedOptionId: null, blankAnswers: { 1: "north", 2: "west" } },
    ]);
    expect(oneWrong.results[0].isCorrect).toBe(false);
  });

  it("marks a multi-blank question incorrect when one blank is left unanswered", () => {
    const result = gradeAttempt(
      [
        gapQuestion(3, [
          { blankIndex: 1, acceptedAnswer: "one" },
          { blankIndex: 2, acceptedAnswer: "two" },
        ]),
      ],
      [{ questionId: 3, selectedOptionId: null, blankAnswers: { 1: "one" } }]
    );
    expect(result.results[0].isCorrect).toBe(false);
  });

  it("requires exact match — near-misses fail (no fuzzy matching)", () => {
    const result = gradeAttempt(
      [gapQuestion(5, [{ blankIndex: 1, acceptedAnswer: "run" }])],
      [{ questionId: 5, selectedOptionId: null, blankAnswers: { 1: "running" } }]
    );
    expect(result.results[0].isCorrect).toBe(false);
  });

  it("marks a FIG question with no blanks as unanswerable", () => {
    const result = gradeAttempt([gapQuestion(4, [])], [
      { questionId: 4, selectedOptionId: null, blankAnswers: { 1: "anything" } },
    ]);
    expect(result.results[0].isCorrect).toBe(false);
  });
});

describe("gradeAttempt — mixed sets and scoring", () => {
  it("grades a mixed set and computes score as correct/total * 100", () => {
    const questions = [
      optionsQuestion(1, 11),
      gapQuestion(2, [{ blankIndex: 1, acceptedAnswer: "yes" }]),
      optionsQuestion(3, 31),
      gapQuestion(4, [{ blankIndex: 1, acceptedAnswer: "no" }]),
    ];
    const answers: SubmittedAnswer[] = [
      { questionId: 1, selectedOptionId: 11, blankAnswers: {} },
      { questionId: 2, selectedOptionId: null, blankAnswers: { 1: "YES" } },
      { questionId: 3, selectedOptionId: 32, blankAnswers: {} },
      // question 4 not answered at all
    ];

    const result = gradeAttempt(questions, answers);
    expect(result.correctCount).toBe(2);
    expect(result.totalQuestions).toBe(4);
    expect(result.score).toBe(50);
  });

  it("rounds fractional scores to 2 decimals (NUMERIC(6,2))", () => {
    // 1 of 3 correct → 33.333...% → 33.33
    const result = gradeAttempt(
      [optionsQuestion(1, 11), optionsQuestion(2, 21), optionsQuestion(3, 31)],
      [{ questionId: 2, selectedOptionId: 21, blankAnswers: {} }]
    );
    expect(result.score).toBe(33.33);
  });

  it("handles an empty quiz gracefully with score 0", () => {
    const result = gradeAttempt([], []);
    expect(result.correctCount).toBe(0);
    expect(result.totalQuestions).toBe(0);
    expect(result.score).toBe(0);
  });
});
