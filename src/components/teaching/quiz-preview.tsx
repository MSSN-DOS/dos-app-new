"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  builderBlocks,
  type BuilderPassage,
  type BuilderQuestion,
} from "@/lib/quizzes/builder";
import type { QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";
import type { SubmittedAnswerInput } from "@/lib/validation/attempts";
import { QuizIntroduction, QuizQuestionView } from "./quiz-student-view";
import { QuizCalculator } from "./quiz-calculator";
function PreviewContent({
  payload,
  coverUrl,
}: {
  payload: QuizDraftPayloadInput;
  coverUrl: string | null;
}) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<Record<number, SubmittedAnswerInput>>({});
  const rows = builderBlocks(
    payload.questions.map((q, i): BuilderQuestion => ({
      ...q,
      clientKey: q.clientKey ?? `preview-${i}`,
    })),
    payload.passages as BuilderPassage[],
  ).flatMap((b) => b.questions);
  if (finished)
    return (
      <p role="status" className="rounded-xl bg-canvas p-5 text-base text-ink">
        Preview complete. Student results remain pending until grading and Admin release.
      </p>
    );
  if (!started)
    return (
      <QuizIntroduction
        preview
        quiz={{
          title: payload.details.title || "Untitled quiz",
          description: payload.details.description ?? "",
          instructions: payload.details.instructions ?? "",
          durationSeconds: payload.details.durationSeconds,
          passMark: payload.details.passMark,
          questionCount: rows.length,
          totalMarks: rows.reduce((sum, q) => sum + q.marks, 0),
          coverImageUrl: coverUrl,
          allowMultipleAttempts: payload.settings.allowMultipleAttempts,
          maxAttempts: payload.settings.maxAttempts,
          allowResume: payload.settings.allowResume,
          deductMarksForWrong: payload.settings.deductMarksForWrong,
          hasOpenAttempt: false,
          canStart: true,
          windowOpen: true,
        }}
        onStart={() => setStarted(true)}
      />
    );
  const q = rows[index];
  if (!q)
    return (
      <p role="status" className="text-base text-sub">
        Add questions to preview this quiz.
      </p>
    );
  const passage = payload.passages.find((p) => p.clientKey === q.passageKey);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-sub">
          Question {index + 1} of {rows.length}
        </p>
        {payload.settings.showCalculator && <QuizCalculator />}
      </div>
      <QuizQuestionView
        number={index + 1}
        question={{
          id: index + 1,
          questionType: q.questionType,
          numericUnit: q.numericUnit,
          bodyRichText: q.bodyRichText,
          marks: q.marks,
          options: (q.options ?? []).map((o, i) => ({
            id: i + 1,
            optionText: o.optionText,
          })),
          blankIndexes: (q.blanks ?? []).map((_, i) => i + 1),
          passage: passage
            ? { id: 1, title: passage.title, bodyRichText: passage.bodyRichText }
            : null,
        }}
        answer={answers[index] ?? { questionId: index + 1 }}
        onChange={(answer) => {
          setAnswers((old) => ({ ...old, [index]: answer }));
          if (
            payload.settings.autoNextQuestion &&
            q.questionType === "options" &&
            answer.selectedOptionId &&
            index < rows.length - 1
          )
            setIndex(index + 1);
        }}
      />
      <div className="flex justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          className="min-h-11"
          onClick={() =>
            index < rows.length - 1 ? setIndex(index + 1) : setFinished(true)
          }
        >
          {index < rows.length - 1 ? "Next question" : "Submit preview"}
        </Button>
      </div>
    </div>
  );
}
export function QuizPreview({
  open,
  onOpenChange,
  payload,
  coverUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: QuizDraftPayloadInput;
  coverUrl: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto border-line bg-canvas text-ink sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Student preview</DialogTitle>
          <DialogDescription className="text-sub">
            Explore the instructions and questions as a student.
          </DialogDescription>
        </DialogHeader>
        <PreviewContent payload={payload} coverUrl={coverUrl} />
      </DialogContent>
    </Dialog>
  );
}
