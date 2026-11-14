import type { SubmittedAnswerInput } from "@/lib/validation/attempts";
export interface QuizIntroductionData {
  title: string;
  description: string;
  instructions: string;
  durationSeconds: number | null;
  passMark: number;
  questionCount: number;
  totalMarks: number;
  coverImageUrl: string | null;
  allowMultipleAttempts: boolean;
  allowResume: boolean;
  deductMarksForWrong: boolean;
  hasOpenAttempt: boolean;
  canStart: boolean;
  windowOpen: boolean;
}
export interface StudentQuizQuestion {
  id: number;
  questionType: "options" | "fill_in_gap" | "essay";
  bodyRichText: string;
  marks: number;
  options: { id: number; optionText: string }[];
  blankIndexes: number[];
  passage: { id: number; title: string | null; bodyRichText: string } | null;
}
export interface StudentQuizAttempt {
  attemptId: number;
  attemptNumber: number;
  title: string;
  instructions: string;
  durationSeconds: number | null;
  startedAt: string;
  savedAnswers: SubmittedAnswerInput[];
  loseFocusPolicy: "ignore" | "warn" | "auto_submit";
  autoNextQuestion: boolean;
  showCalculator: boolean;
  allowResume: boolean;
  deductMarksForWrong: boolean;
  questions: StudentQuizQuestion[];
}
export interface StudentQuizReview {
  title: string;
  status: "awaiting_grading" | "held" | "released" | "hidden";
  score?: number;
  passed?: boolean;
  questions: {
    id: number;
    bodyRichText: string;
    reasonRichText: string;
    questionType: StudentQuizQuestion["questionType"];
    correctOptions: string[];
    acceptedAnswers: string[];
  }[];
}
