import type { questionTypeEnum } from "@/lib/db/schema/enums";

type QuestionType = (typeof questionTypeEnum.enumValues)[number];

export interface GradingOption {
  id: number;
  isCorrect: boolean;
}

export interface GradingBlank {
  blankIndex: number;
  acceptedAnswer: string;
}

export interface GradingQuestion {
  id: number;
  questionType: QuestionType;
  options: GradingOption[];
  blanks: GradingBlank[];
}

/** One submitted answer as received from the client on attempt submit. */
export interface SubmittedAnswer {
  questionId: number;
  /** For `options` questions: exactly one selected option id. */
  selectedOptionId: number | null;
  /** For `fill_in_gap` questions: submitted text keyed by blank index. */
  blankAnswers: Record<number, string>;
}

export interface GradedQuestionResult {
  questionId: number;
  isCorrect: boolean;
}

export interface GradeResult {
  /** Per-question verdicts in the same order as the graded questions. */
  results: GradedQuestionResult[];
  correctCount: number;
  totalQuestions: number;
  /** (correctCount / totalQuestions) * 100 rounded to 2 decimals, matching quiz_attempts.score NUMERIC(6,2). */
  score: number;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function gradeOptionsQuestion(
  question: GradingQuestion,
  answer: SubmittedAnswer
): boolean {
  if (answer.selectedOptionId === null || answer.selectedOptionId === undefined) {
    return false;
  }
  // Exactly one option should have is_correct = true (enforced at save time);
  // if data ever violates that, treat the question as unanswerable-correctly.
  const correctOptions = question.options.filter((option) => option.isCorrect);
  if (correctOptions.length !== 1) {
    return false;
  }
  return correctOptions[0].id === answer.selectedOptionId;
}

function gradeFillInGapQuestion(
  question: GradingQuestion,
  answer: SubmittedAnswer
): boolean {
  // Every blank must be answered correctly for the question to count — no partial credit.
  if (question.blanks.length === 0) {
    return false;
  }
  return question.blanks.every((blank) => {
    const submitted = answer.blankAnswers[blank.blankIndex];
    if (submitted === undefined || submitted === null) {
      return false;
    }
    // Case-insensitive always (DESIGN.md §4): the case_sensitive column is ignored.
    return normalize(submitted) === normalize(blank.acceptedAnswer);
  });
}

/**
 * Grade a full set of submitted answers against their questions.
 * Pure function — no DB access; the caller fetches questions with their
 * options/blanks and maps client answers into SubmittedAnswer shapes.
 */
export function gradeAttempt(
  questions: GradingQuestion[],
  answers: SubmittedAnswer[]
): GradeResult {
  const byQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  const results = questions.map((question) => {
    const answer = byQuestionId.get(question.id);
    let isCorrect = false;
    if (answer) {
      isCorrect =
        question.questionType === "options"
          ? gradeOptionsQuestion(question, answer)
          : gradeFillInGapQuestion(question, answer);
    }
    return { questionId: question.id, isCorrect };
  });

  const correctCount = results.filter((result) => result.isCorrect).length;
  const totalQuestions = questions.length;
  const raw = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  return {
    results,
    correctCount,
    totalQuestions,
    score: Math.round(raw * 100) / 100,
  };
}
