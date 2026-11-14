import type { QuizSettingKey } from "@/lib/validation/quiz-settings";

export interface QuizSettingDefinition {
  key: QuizSettingKey;
  label: string;
  description: string;
  group: "Attempt rules" | "Access & visibility" | "Scoring & results" | "Scheduling";
}
export const quizSettingDefinitions: QuizSettingDefinition[] = [
  {
    key: "shuffleQuestions",
    label: "Shuffle questions",
    description: "Change question order for each attempt.",
    group: "Attempt rules",
  },
  {
    key: "shuffleOptions",
    label: "Shuffle answers",
    description: "Change the order of multiple-choice options.",
    group: "Attempt rules",
  },
  {
    key: "allowMultipleAttempts",
    label: "Allow multiple attempts",
    description: "Let students try again; their best released score counts.",
    group: "Attempt rules",
  },
  {
    key: "allowResume",
    label: "Resume uncompleted attempt",
    description: "Continue the same attempt with saved answers and remaining time.",
    group: "Attempt rules",
  },
  {
    key: "permitFocusLoss",
    label: "Permit focus loss",
    description:
      "Allow switching tabs or windows. When off, leaving the quiz shows a warning.",
    group: "Attempt rules",
  },
  {
    key: "autoNextQuestion",
    label: "Move to next question automatically",
    description: "Advance after selecting an answer to an objective question.",
    group: "Attempt rules",
  },
  {
    key: "requireLoginToAttempt",
    label: "Require login to attempt",
    description: "All quizzes require a signed-in, eligible student account.",
    group: "Access & visibility",
  },
  {
    key: "showAnswersAfter",
    label: "Show answers after attempt",
    description: "Reveal correct answers and explanations after submission.",
    group: "Scoring & results",
  },
  {
    key: "showResultAfter",
    label: "Show result after attempt",
    description:
      "Show score and pass/fail after grading is complete and an Admin releases results.",
    group: "Scoring & results",
  },
  {
    key: "showCalculator",
    label: "Show calculator",
    description: "Offer a calculator during the attempt.",
    group: "Scoring & results",
  },
  {
    key: "deductMarksForWrong",
    label: "Deduct marks for wrong answers",
    description:
      "An incorrect objective answer loses its full question marks. Unanswered questions earn zero; essays have no automatic deductions. The final score cannot fall below zero.",
    group: "Scoring & results",
  },
  {
    key: "scheduleEnabled",
    label: "Schedule quiz",
    description: "Choose a start date/time and an optional end date/time.",
    group: "Scheduling",
  },
];

export function filterQuizSettings(query: string): QuizSettingDefinition[] {
  const needle = query.trim().toLowerCase();
  return quizSettingDefinitions.filter((s) =>
    `${s.label} ${s.description} ${s.group}`.toLowerCase().includes(needle),
  );
}

/** datetime-local has no timezone. Scheduling is consistently displayed in WAT. */
export function scheduleInputValue(value: Date | null): string {
  if (!value) return "";
  return new Date(value.getTime() + 3600000).toISOString().slice(0, 16);
}
export function scheduleDateValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
