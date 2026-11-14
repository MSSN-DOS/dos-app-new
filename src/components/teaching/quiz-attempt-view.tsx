"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/auth/client-fetch";
import type {
  QuizIntroductionData,
  StudentQuizAttempt,
  StudentQuizReview,
} from "@/lib/quizzes/student";
import {
  submitAttemptSchema,
  type SubmitAttemptInput,
  type SubmittedAnswerInput,
} from "@/lib/validation/attempts";
import { QuizIntroduction, QuizQuestionView, QuizRichText } from "./quiz-student-view";
import { QuizCalculator } from "./quiz-calculator";

type Submission = {
  attemptId: number;
  scoreStatus: "held" | "awaiting_grading";
  message: string;
};
type AnswerMap = Record<number, SubmittedAnswerInput>;

function LoadingQuiz() {
  return (
    <div aria-busy="true" aria-label="Loading quiz" className="space-y-4">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
function QuizError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-line bg-panel p-5">
      <p className="break-words text-base text-ruby">{message}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export function QuizReview({ quizId, attemptId }: { quizId: string; attemptId: number }) {
  const query = useQuery({
    queryKey: ["quiz-review", quizId, attemptId],
    queryFn: () =>
      apiFetch<{ data: StudentQuizReview }>(
        `/quizzes/${quizId}/review?attemptId=${attemptId}`,
      ).then((r) => r.data),
  });
  if (query.isPending) return <LoadingQuiz />;
  if (query.isError)
    return <QuizError message={query.error.message} retry={() => void query.refetch()} />;
  const review = query.data;
  return (
    <section className="space-y-5" aria-labelledby="quiz-review-heading">
      <div className="space-y-3 rounded-2xl border border-line bg-panel p-4 sm:p-6">
        <h1
          id="quiz-review-heading"
          className="break-words text-2xl font-semibold text-ink"
        >
          {review.title}
        </h1>
        <h2 className="text-lg font-semibold text-ink">Submission received</h2>
        <p role="status" className="text-base text-sub">
          {review.status === "awaiting_grading"
            ? "Your teacher will grade the essays before an Admin releases your result."
            : review.status === "held"
              ? "Your answers are saved. Your result is pending Admin release."
              : review.status === "hidden"
                ? "Your teacher has chosen to hide results for this quiz."
                : "Your result has been released."}
        </p>
        {review.score !== undefined && (
          <p className="text-xl font-semibold text-ink">
            Score: {review.score}% · {review.passed ? "Passed" : "Not passed"}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void query.refetch()}
          >
            Refresh result
          </Button>
          <Button asChild className="min-h-11">
            <Link href="/history">View history</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
      {review.questions.length > 0 && (
        <section className="space-y-4" aria-label="Answers and explanations">
          <h2 className="text-xl font-semibold text-ink">Answers and explanations</h2>
          {review.questions.map((q, i) => (
            <article
              key={q.id}
              className="space-y-3 rounded-xl border border-line bg-panel p-4"
            >
              <h3 className="text-lg font-semibold text-ink">Question {i + 1}</h3>
              <QuizRichText value={q.bodyRichText} />
              {q.correctOptions.map((value, j) => (
                <div key={j}>
                  <p className="text-base font-semibold text-ink">Correct answer</p>
                  <QuizRichText value={value} />
                </div>
              ))}
              {q.acceptedAnswers.map((value, j) => (
                <p key={j} className="break-words text-base text-ink">
                  Gap {j + 1}: {value}
                </p>
              ))}
              {q.questionType === "essay" && (
                <p className="text-base text-sub">Manually graded by your teacher.</p>
              )}
              {q.reasonRichText && (
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-ink">Explanation</h4>
                  <QuizRichText value={q.reasonRichText} />
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function AttemptSession({
  quizId,
  attempt,
  onSubmitted,
}: {
  quizId: string;
  attempt: StudentQuizAttempt;
  onSubmitted: (result: Submission) => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(() =>
    Object.fromEntries(attempt.savedAnswers.map((a) => [a.questionId, a])),
  );
  const answerRef = useRef(answers);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [focusWarning, setFocusWarning] = useState(false);
  const submitting = useRef(false);
  const autoSubmitted = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const savedSnapshot = useRef(JSON.stringify(answers));
  const [dirty, setDirty] = useState(false);
  const queryClient = useQueryClient();
  const payload = (values: AnswerMap): SubmitAttemptInput =>
    submitAttemptSchema.parse({
      answers: attempt.questions.map((q) => values[q.id] ?? { questionId: q.id }),
    });
  const saveMutation = useMutation({
    mutationFn: (values: AnswerMap) => {
      const snapshot = JSON.stringify(values);
      const save = saveQueue.current
        .catch(() => undefined)
        .then(() =>
          apiFetch(`/quizzes/${quizId}/attempt`, {
            method: "PUT",
            body: JSON.stringify(payload(values)),
          }),
        );
      saveQueue.current = save;
      return save.then(() => {
        savedSnapshot.current = snapshot;
        if (JSON.stringify(answerRef.current) === snapshot) setDirty(false);
      });
    },
  });
  const submitMutation = useMutation({
    mutationFn: async (values: AnswerMap) => {
      await saveQueue.current.catch(() => undefined);
      return apiFetch<{ data: Submission }>(`/quizzes/${quizId}/attempt`, {
        method: "POST",
        body: JSON.stringify(payload(values)),
      }).then((r) => r.data);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-attempts"] });
      onSubmitted(result);
    },
    onError: () => {
      submitting.current = false;
    },
  });
  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    submitMutation.mutate(answerRef.current);
  };
  const expiresAt =
    attempt.durationSeconds === null
      ? null
      : Date.parse(attempt.startedAt) + attempt.durationSeconds * 1000;
  const remaining =
    expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const question = attempt.questions[index];
  const answeredCount = attempt.questions.filter((q) => {
    const a = answers[q.id];
    return q.questionType === "options"
      ? a?.selectedOptionId != null
      : q.questionType === "essay"
        ? Boolean(a?.essayAnswer?.trim())
        : q.blankIndexes.every((blank) =>
            Boolean(a?.blankAnswers?.[String(blank)]?.trim()),
          );
  }).length;

  useEffect(() => {
    if (expiresAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  const submitLatest = useRef(submit);
  useEffect(() => {
    submitLatest.current = submit;
  });
  useEffect(() => {
    if (remaining !== 0 || autoSubmitted.current) return;
    autoSubmitted.current = true;
    submitLatest.current();
  }, [remaining]);
  useEffect(() => {
    if (attempt.loseFocusPolicy === "ignore") return;
    const lostFocus = () => {
      if (submitting.current) return;
      if (attempt.loseFocusPolicy === "warn") setFocusWarning(true);
      else submitLatest.current();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") lostFocus();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", lostFocus);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", lostFocus);
    };
  }, [attempt.loseFocusPolicy]);
  const saveProgress = saveMutation.mutate;
  const timeEnded = remaining === 0;
  useEffect(() => {
    if (
      !attempt.allowResume ||
      !dirty ||
      submitting.current ||
      timeEnded ||
      JSON.stringify(answers) === savedSnapshot.current
    )
      return;
    const timeout = window.setTimeout(() => {
      if (!submitting.current) saveProgress(answers);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [answers, attempt.allowResume, dirty, timeEnded, saveProgress]);

  if (!question)
    return (
      <p role="status" className="text-base text-sub">
        No questions available.
      </p>
    );
  return (
    <div className="space-y-4">
      <header className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <h1 className="break-words text-2xl font-semibold text-ink">{attempt.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-sub">
            Attempt {attempt.attemptNumber} · {answeredCount}/{attempt.questions.length}{" "}
            answered
          </p>
          <p
            className={
              remaining !== null && remaining <= 60
                ? "flex items-center gap-2 text-base font-semibold text-ruby"
                : "flex items-center gap-2 text-base text-ink"
            }
          >
            <Clock3 className="size-5" />
            {remaining === null
              ? "No time limit"
              : `Time left: ${Math.floor(remaining / 3600)
                  .toString()
                  .padStart(2, "0")}:${Math.floor((remaining % 3600) / 60)
                  .toString()
                  .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`}
          </p>
        </div>
        <nav aria-label="Questions" className="flex flex-wrap gap-2">
          {attempt.questions.map((q, i) => (
            <Button
              key={q.id}
              type="button"
              variant={index === i ? "default" : "outline"}
              className="size-11 p-0"
              aria-current={index === i ? "step" : undefined}
              aria-label={`Go to question ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </Button>
          ))}
        </nav>
        {attempt.showCalculator && <QuizCalculator />}
      </header>
      {remaining !== null && remaining <= 60 && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3 text-base text-ruby"
        >
          <AlertTriangle className="size-5 shrink-0" />
          {remaining === 0
            ? "Time has ended. Submitting your answers."
            : "Less than a minute remains. Your answers submit when the timer ends."}
        </p>
      )}
      <fieldset disabled={submitMutation.isPending || timeEnded} className="min-w-0">
        <QuizQuestionView
          question={question}
          number={index + 1}
          answer={answers[question.id] ?? { questionId: question.id }}
          onChange={(answer) => {
            const next = { ...answerRef.current, [question.id]: answer };
            answerRef.current = next;
            setAnswers(next);
            setDirty(true);
            if (
              attempt.autoNextQuestion &&
              question.questionType === "options" &&
              answer.selectedOptionId != null &&
              index < attempt.questions.length - 1
            )
              setIndex(index + 1);
          }}
        />
      </fieldset>
      {attempt.allowResume && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={saveMutation.isPending || submitMutation.isPending || timeEnded}
            onClick={() => saveMutation.mutate(answerRef.current)}
          >
            Save progress
          </Button>
          <p role="status" className="text-base text-sub">
            {saveMutation.isPending
              ? "Saving progress…"
              : dirty
                ? "Unsaved changes"
                : "Progress saved"}
          </p>
        </div>
      )}
      {saveMutation.isError && (
        <p role="alert" className="text-base text-ruby">
          Progress could not be saved: {saveMutation.error.message}. Your answers are
          still on this page.
        </p>
      )}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap justify-between gap-3 rounded-xl border border-line bg-panel p-3 md:bottom-0">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={index === 0 || submitMutation.isPending}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </Button>
        <div className="flex flex-wrap gap-2">
          {index < attempt.questions.length - 1 && (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => setIndex(index + 1)}
            >
              Next question
            </Button>
          )}
          <Button
            type="button"
            variant={index === attempt.questions.length - 1 ? "default" : "outline"}
            className="min-h-11"
            disabled={submitMutation.isPending}
            onClick={() => setConfirm(true)}
          >
            {submitMutation.isPending ? "Submitting…" : "Submit quiz"}
          </Button>
        </div>
      </div>
      {submitMutation.isError && (
        <QuizError message={submitMutation.error.message} retry={submit} />
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your answers?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              You answered {answeredCount} of {attempt.questions.length} questions.
              Unanswered questions earn zero. Results require grading and Admin release.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep working</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={submit}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={focusWarning} onOpenChange={setFocusWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stay on the quiz</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Your teacher asks you to keep this tab and window focused. Your timer
              continues while you are away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="min-h-11">Return to quiz</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function QuizAttemptView({ quizId }: { quizId: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const introduction = useQuery({
    queryKey: ["quiz-introduction", quizId],
    queryFn: () =>
      apiFetch<{ data: QuizIntroductionData }>(`/quizzes/${quizId}`).then((r) => r.data),
    retry: false,
  });
  // Starting an attempt changes server state; refocusing this page must not start one.
  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ data: StudentQuizAttempt }>(`/quizzes/${quizId}/attempt`).then(
        (r) => r.data,
      ),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {submission ? (
        <QuizReview quizId={quizId} attemptId={submission.attemptId} />
      ) : start.data ? (
        <AttemptSession
          key={start.data.attemptId}
          quizId={quizId}
          attempt={start.data}
          onSubmitted={setSubmission}
        />
      ) : introduction.isPending || start.isPending ? (
        <LoadingQuiz />
      ) : introduction.isError ? (
        <QuizError
          message={introduction.error.message}
          retry={() => void introduction.refetch()}
        />
      ) : (
        <>
          <QuizIntroduction quiz={introduction.data} onStart={() => start.mutate()} />
          {start.isError && (
            <QuizError message={start.error.message} retry={() => start.mutate()} />
          )}
        </>
      )}
    </div>
  );
}
