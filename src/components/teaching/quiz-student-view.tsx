"use client";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { QuizInlineGaps } from "./quiz-inline-gaps";
import { formatDurationSeconds } from "@/lib/quizzes/duration";
import { renderRichText } from "@/lib/rich-text";
import type { QuizIntroductionData, StudentQuizQuestion } from "@/lib/quizzes/student";
import type { SubmittedAnswerInput } from "@/lib/validation/attempts";

export function QuizRichText({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`dos-rich-text min-w-0 break-words text-base text-ink ${className}`}
      dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
    />
  );
}
export function QuizIntroduction({
  quiz,
  onStart,
  preview = false,
}: {
  quiz: QuizIntroductionData;
  onStart: () => void;
  preview?: boolean;
}) {
  return (
    <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-line bg-panel p-4 sm:p-6">
      {quiz.coverImageUrl && (
        <Image
          src={quiz.coverImageUrl}
          alt="Quiz cover"
          width={1200}
          height={600}
          unoptimized
          className="aspect-[2/1] max-h-72 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="break-words text-2xl font-semibold text-ink">{quiz.title}</h1>
      {quiz.description && <QuizRichText value={quiz.description} />}
      <dl className="grid grid-cols-2 gap-3 text-base sm:grid-cols-4">
        {[
          ["Questions", quiz.questionCount],
          ["Total marks", quiz.totalMarks],
          [
            "Duration",
            quiz.durationSeconds === null
              ? "No time limit"
              : formatDurationSeconds(quiz.durationSeconds),
          ],
          ["Pass mark", `${quiz.passMark}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-canvas p-3">
            <dt className="text-sub">{label}</dt>
            <dd className="mt-1 font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {quiz.instructions && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Instructions</h2>
          <QuizRichText value={quiz.instructions} />
        </section>
      )}
      <p className="text-base text-sub">
        {quiz.allowMultipleAttempts
          ? `You may make ${quiz.maxAttempts ?? "unlimited"} attempts${quiz.completedAttempts === undefined ? "" : ` (${quiz.completedAttempts} completed)`}. Your best released score counts.`
          : "You may make one attempt."}{" "}
        Results appear after grading and Admin release.
      </p>
      {quiz.deductMarksForWrong && (
        <p className="rounded-xl border border-line bg-canvas p-3 text-base text-ink">
          An incorrect objective answer deducts its full question marks. Unanswered
          questions earn zero. Essays are marked by your teacher. The final score cannot
          fall below zero.
        </p>
      )}
      {!quiz.windowOpen && (
        <p role="status" className="text-base text-sub">
          This quiz is outside its availability window.
        </p>
      )}
      {!quiz.canStart && (
        <p role="status" className="text-base text-sub">
          You have already attempted this quiz.
        </p>
      )}
      <Button
        type="button"
        className="min-h-11 w-full text-base sm:w-auto"
        disabled={!quiz.canStart || !quiz.windowOpen || quiz.questionCount === 0}
        onClick={onStart}
      >
        {preview
          ? "Start preview"
          : quiz.hasOpenAttempt && quiz.allowResume
            ? "Resume attempt"
            : "Start quiz"}
      </Button>
    </section>
  );
}
export function QuizQuestionView({
  question,
  number,
  answer,
  onChange,
}: {
  question: StudentQuizQuestion;
  number: number;
  answer: SubmittedAnswerInput;
  onChange: (value: SubmittedAnswerInput) => void;
}) {
  const prefix = `attempt-question-${question.id}`;
  return (
    <section
      className="min-w-0 space-y-5 rounded-2xl border border-line bg-panel p-4 sm:p-6"
      aria-labelledby={`${prefix}-heading`}
    >
      {question.passage && (
        <section className="space-y-2 rounded-xl border border-line bg-canvas p-4">
          <h2 className="text-lg font-semibold text-ink">
            {question.passage.title || "Passage"}
          </h2>
          <QuizRichText value={question.passage.bodyRichText} />
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${prefix}-heading`} className="text-lg font-semibold text-ink">
          Question {number}
        </h2>
        <Badge variant="secondary">
          {question.marks} mark{question.marks === 1 ? "" : "s"}
        </Badge>
      </div>
      {question.questionType === "fill_in_gap" ? (
        <QuizInlineGaps
          key={question.bodyRichText}
          body={question.bodyRichText}
          blankIndexes={question.blankIndexes}
          answer={answer}
          onChange={onChange}
        />
      ) : (
        <QuizRichText value={question.bodyRichText} />
      )}
      {question.questionType === "options" && (
        <RadioGroup
          aria-label="Choose one answer"
          value={answer.selectedOptionId == null ? "" : String(answer.selectedOptionId)}
          onValueChange={(value) =>
            onChange({ questionId: question.id, selectedOptionId: Number(value) })
          }
          className="space-y-3"
        >
          {question.options.map((option, index) => (
            <div
              key={option.id}
              className="flex min-h-11 items-start gap-3 rounded-xl border border-line bg-canvas p-3 focus-within:ring-2 focus-within:ring-ring"
            >
              <RadioGroupItem
                id={`${prefix}-option-${option.id}`}
                className="mt-1"
                value={String(option.id)}
                aria-labelledby={`${prefix}-option-label-${option.id}`}
              />
              <label
                id={`${prefix}-option-label-${option.id}`}
                htmlFor={`${prefix}-option-${option.id}`}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3"
              >
                <span className="mt-0.5 text-base font-semibold text-ink">
                  {String.fromCharCode(65 + index)}.
                </span>
                <QuizRichText value={option.optionText} className="flex-1" />
              </label>
            </div>
          ))}
        </RadioGroup>
      )}
      {question.questionType === "multi_answer" && (
        <fieldset className="space-y-3">
          <legend className="text-base text-sub">Select all correct answers</legend>
          {question.options.map((option, index) => (
            <label
              key={option.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-canvas p-3 focus-within:ring-2 focus-within:ring-ring"
            >
              <Checkbox
                aria-label={`Option ${String.fromCharCode(65 + index)}`}
                checked={answer.selectedOptionIds?.includes(option.id) ?? false}
                onCheckedChange={(checked) =>
                  onChange({
                    questionId: question.id,
                    selectedOptionIds: checked
                      ? [...(answer.selectedOptionIds ?? []), option.id]
                      : (answer.selectedOptionIds ?? []).filter((id) => id !== option.id),
                  })
                }
              />
              <span>{String.fromCharCode(65 + index)}.</span>
              <QuizRichText value={option.optionText} className="flex-1" />
            </label>
          ))}
        </fieldset>
      )}
      {question.questionType === "numeric" && (
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-numeric`} className="text-base">
            Numeric answer {question.numericUnit && `(${question.numericUnit})`}
          </Label>
          <Input
            id={`${prefix}-numeric`}
            inputMode="decimal"
            maxLength={100}
            autoComplete="off"
            className="min-h-11 text-base"
            placeholder="Enter a number, e.g. 3.14 or 1e-3"
            value={answer.numericAnswer ?? ""}
            onChange={(e) =>
              onChange({ questionId: question.id, numericAnswer: e.target.value })
            }
          />
          <p className="text-base text-sub">
            Enter the number only. Scientific notation is accepted.
          </p>
        </div>
      )}
      {question.questionType === "essay" && (
        <div className="space-y-2">
          <Badge variant="secondary">Manually graded</Badge>
          <p className="text-base text-sub">Your teacher will mark this response.</p>
          <Label htmlFor={`${prefix}-essay`} className="text-base">
            Your response
          </Label>
          <Textarea
            id={`${prefix}-essay`}
            rows={8}
            maxLength={20000}
            className="min-h-44 text-base"
            value={answer.essayAnswer ?? ""}
            onChange={(e) =>
              onChange({ questionId: question.id, essayAnswer: e.target.value })
            }
          />
        </div>
      )}
    </section>
  );
}
