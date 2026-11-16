import {
  gradeAttempt,
  type GradingQuestion,
  type SubmittedAnswer,
} from "./grade-attempt";

export type WeightedGradingQuestion = GradingQuestion & { marks: number };
export type WeightedSubmittedAnswer = SubmittedAnswer & { essayAnswer?: string | null };
export interface WeightedGradeResult {
  score: number | null;
  totalMarks: number;
  earnedMarks: number;
  pendingManual: number;
  results: {
    questionId: number;
    isCorrect: boolean | null;
    awardedMarks: number | null;
    answered: boolean;
  }[];
}

/** Objective questions are all-or-nothing. Only explicit teacher awards grade essays. */
export function gradeWeightedAttempt(
  questions: readonly WeightedGradingQuestion[],
  answers: readonly WeightedSubmittedAnswer[],
  deductWrong = false,
  manualAwards: ReadonlyMap<number, number> = new Map(),
): WeightedGradeResult {
  const objective = questions.filter((q) => q.questionType !== "essay");
  const verdicts = new Map(
    gradeAttempt(objective, [...answers]).results.map((r) => [r.questionId, r.isCorrect]),
  );
  const submitted = new Map(answers.map((a) => [a.questionId, a]));
  const results = questions.map((q) => {
    if (!Number.isInteger(q.marks) || q.marks < 1)
      throw new Error("Published questions need positive whole marks");
    const answer = submitted.get(q.id);
    const answered =
      q.questionType === "options"
        ? answer?.selectedOptionId != null
        : q.questionType === "multi_answer"
          ? Boolean(answer?.selectedOptionIds?.length)
          : q.questionType === "numeric"
            ? Boolean(answer?.numericAnswer?.trim())
            : q.questionType === "essay"
              ? Boolean(answer?.essayAnswer?.trim())
              : q.blanks.some((b) => Boolean(answer?.blankAnswers[b.blankIndex]?.trim()));
    if (q.questionType === "essay") {
      const award = manualAwards.get(q.id);
      if (
        award !== undefined &&
        (!Number.isInteger(award) || award < 0 || award > q.marks)
      )
        throw new Error("Essay marks must be within the question's marks");
      return { questionId: q.id, isCorrect: null, awardedMarks: award ?? null, answered };
    }
    const isCorrect = verdicts.get(q.id) ?? false;
    return {
      questionId: q.id,
      isCorrect,
      awardedMarks: isCorrect ? q.marks : answered && deductWrong ? -q.marks : 0,
      answered,
    };
  });
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const earnedMarks = results.reduce((sum, r) => sum + (r.awardedMarks ?? 0), 0);
  const pendingManual = results.filter((r) => r.awardedMarks === null).length;
  return {
    results,
    totalMarks,
    earnedMarks,
    pendingManual,
    score: pendingManual
      ? null
      : totalMarks
        ? Math.round((Math.max(0, earnedMarks) / totalMarks) * 10000) / 100
        : 0,
  };
}
