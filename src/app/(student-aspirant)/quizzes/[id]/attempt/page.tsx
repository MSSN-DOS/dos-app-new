"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Sparkles, ShieldCheck, CircleDot } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Question = {
  id: number;
  questionType: "options" | "fill_in_gap";
  bodyRichText: string;
  options: { id: number; optionText: string }[];
  blankIndexes: number[];
};

type Attempt = {
  attemptId: number;
  title: string;
  instructions: string | null;
  startedAt: string;
  timeLimitMinutes: number;
  loseFocusPolicy: "ignore" | "warn" | "auto_submit";
  questions: Question[];
};

type Answers = Record<number, { selectedOptionId?: number; blankAnswers?: Record<string, string> }>;
const NO_QUESTIONS: Question[] = [];

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(Math.max(seconds, 0) / 60);
  const remainder = Math.max(seconds, 0) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

type AnswerValue = Answers[number];
function isAnswered(q: Question, a: AnswerValue | undefined): boolean {
  if (!a) return false;
  if (q.questionType === "options") return typeof a.selectedOptionId === "number";
  const blanks = a.blankAnswers ?? {};
  return q.blankIndexes.some((i) => (blanks[String(i)] ?? "").trim() !== "");
}

export default function QuizAttemptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const quizId = params.id;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const [focusWarningOpen, setFocusWarningOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [expired, setExpired] = useState(false);

  const attemptQuery = useQuery({
    queryKey: ["quiz-attempt", quizId],
    queryFn: () => apiFetch<{ data: Attempt }>(`/quizzes/${quizId}/attempt`),
    enabled: Boolean(quizId),
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { answers: unknown[] }) =>
      apiFetch<{ data: { attemptId: number; scoreStatus: "held"; message: string } }>(`/quizzes/${quizId}/attempt`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      submittedRef.current = true;
      toast.success("Quiz submitted — score will be released by the Board");
    },
    onError: (error) => {
      submittedRef.current = false;
      if (error instanceof ApiError && error.status === 409) setExpired(true);
      const msg = error instanceof ApiError ? error.message : "Submission failed — check your connection and try again.";
      toast.error(msg);
    },
  });

  const attempt = attemptQuery.data?.data;
  const questions = attempt?.questions ?? NO_QUESTIONS;
  const question = questions[currentIndex];
  const expiresAt = attempt ? new Date(attempt.startedAt).getTime() + attempt.timeLimitMinutes * 60_000 : 0;
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isLastQuestion = currentIndex === questions.length - 1;
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const remainingRatio = attempt ? Math.max(0, Math.min(1, remainingSeconds / (attempt.timeLimitMinutes * 60))) : 1;
  const urgent = remainingSeconds <= 60;
  const warning = remainingSeconds <= 300 && remainingSeconds > 60;

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!attempt || submittedRef.current) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    if (!attempt || remainingSeconds > 1 || submittedRef.current || submitMutation.isPending) return;
    submittedRef.current = true;
    submitMutation.mutate({ answers: buildSubmission(answersRef.current, questions) });
  }, [attempt, questions, remainingSeconds, submitMutation]);

  useEffect(() => {
    if (!attempt || attempt.loseFocusPolicy === "ignore") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || submittedRef.current) return;
      if (attempt.loseFocusPolicy === "warn") {
        setFocusWarningOpen(true);
        return;
      }
      submittedRef.current = true;
      submitMutation.mutate({ answers: buildSubmission(answersRef.current, questions) });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attempt, questions, submitMutation]);

  function updateAnswer(questionId: number, value: { selectedOptionId?: number; blankAnswers?: Record<string, string> }) {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
  }

  function submit() {
    if (submittedRef.current || submitMutation.isPending) return;
    submittedRef.current = true;
    submitMutation.mutate({ answers: buildSubmission(answersRef.current, questions) });
  }

  if (attemptQuery.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-2/3 rounded-2xl bg-line" />
        <Skeleton className="h-4 w-1/2 rounded-full bg-line" />
        <Skeleton className="h-[360px] w-full rounded-[22px] bg-line" />
        <Skeleton className="h-11 w-full rounded-xl bg-line" />
      </div>
    );
  }

  if (attemptQuery.isError) {
    const message =
      attemptQuery.error instanceof ApiError
        ? attemptQuery.error.message
        : "This quiz couldn't be opened. Check your connection and try again.";
    return (
      <div className="mx-auto max-w-xl">
        <div className="overflow-hidden rounded-[22px] border border-ruby/30 bg-panel">
          <div className="h-1 w-full bg-ruby" />
          <div className="p-6">
            <h2 className="text-base font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>Quiz unavailable</h2>
            <p className="mt-1 break-words text-sm leading-relaxed text-sub">{message}</p>
            <button type="button" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => attemptQuery.refetch()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  if (submitMutation.isSuccess) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="overflow-hidden rounded-[22px] border border-line bg-panel">
          <div className="h-1 w-full bg-gradient-to-r from-brand to-gold" />
          <div className="p-6 sm:p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand"><CheckCircle2 className="size-6" /></span>
            <h2 className="mt-4 text-xl font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>Submission received</h2>
            <p className="mx-auto mt-2 max-w-sm break-words text-sm leading-relaxed text-sub">Your answers are saved. Course Quiz scores stay hidden until the Board releases them — check History then.</p>
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => router.push("/history")}>View history</button>
              <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-canvas px-5 text-sm font-semibold text-ink hover:bg-line" onClick={() => router.push("/dashboard")}>Dashboard</button>
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}><ShieldCheck className="size-3.5" /> Held for Board release — not visible until approved</p>
          </div>
        </div>
      </div>
    );
  }

  if (!attempt || !question) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-[22px] border border-line bg-panel p-8 text-center">
          <CircleDot className="mx-auto size-8 text-faint" />
          <h2 className="mt-3 text-base font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>No questions available</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-sub">This quiz has no published questions yet. Check back after your teacher publishes them.</p>
          <button type="button" onClick={() => router.push("/dashboard")} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line bg-canvas px-4 text-sm font-semibold text-ink hover:bg-line">Back to dashboard</button>
        </div>
      </div>
    );
  }

  const answer = answers[question.id] ?? {};
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* header + timer */}
      <div className="overflow-hidden rounded-[22px] border border-line bg-panel">
        <div className="h-1 w-full bg-gradient-to-r from-brand to-gold" />
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <Sparkles className="size-3" /> Attempt #{attempt.attemptId} · {answeredCount}/{questions.length} answered
              </p>
              <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-ink sm:text-[24px]" style={{ fontFamily: "var(--font-fraunces), serif" }}>{attempt.title}</h1>
              {attempt.instructions && <p className="mt-2 max-w-xl break-words text-[13px] leading-relaxed text-sub">{attempt.instructions}</p>}
            </div>
            <div className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 ${urgent ? "border-ruby bg-ruby/10 text-ruby" : warning ? "border-gold/40 bg-gold/10 text-gold" : "border-line bg-canvas text-ink"}`}>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}><Clock3 className="size-3" /> Time left</span>
              <span className="font-mono text-[22px] font-bold tabular-nums leading-none" aria-live="polite">{formatRemaining(remainingSeconds)}</span>
              <span className="text-[11px] opacity-60">{attempt.timeLimitMinutes} min total</span>
            </div>
          </div>

          {/* timer bar + progress */}
          <div className="mt-4 space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
              <div className={`h-full transition-all ${urgent ? "bg-ruby" : warning ? "bg-gold" : "bg-brand"}`} style={{ width: `${Math.round(remainingRatio * 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>{progress}% answered</span>
              <span className="text-faint">{attempt.loseFocusPolicy !== "ignore" && <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> {attempt.loseFocusPolicy === "warn" ? "Warn on tab leave" : "Auto-submit on leave"}</span>}</span>
            </div>
          </div>

          {/* dots nav */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const active = idx === currentIndex;
              const done = isAnswered(q, answers[q.id]);
              return (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Go to question ${idx + 1}${done ? " — answered" : ""}${active ? " — current" : ""}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`inline-flex size-8 items-center justify-center rounded-xl border text-xs font-bold transition-colors ${active ? "border-brand bg-brand text-white shadow" : done ? "border-brand/30 bg-brand/15 text-brand-soft hover:border-brand/50" : "border-line bg-canvas text-faint hover:border-brand/20 hover:text-ink"}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {urgent && (
        <div className="flex items-center gap-2 rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm font-medium text-ruby" role="status">
          <AlertTriangle className="size-4 shrink-0" /> Less than a minute left — submit now or answers auto-submit at 00:00.
        </div>
      )}
      {warning && !urgent && (
        <div className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-medium text-gold" role="status">
          <Clock3 className="size-4 shrink-0" /> Under 5 minutes remaining — consider reviewing and submitting.
        </div>
      )}

      {/* question card */}
      <div className="overflow-hidden rounded-[22px] border border-line bg-panel">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-3 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Question {currentIndex + 1} of {questions.length}</p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${question.questionType === "options" ? "bg-brand/15 text-brand-soft border border-brand/20" : "bg-gold/15 text-gold border border-gold/20"}`}>{question.questionType === "options" ? "Options" : "Fill in the gap"}</span>
        </div>
        <div className="p-4 sm:p-6">
          <div
            className="break-words text-[16px] font-medium leading-7 text-ink [&_b]:font-bold [&_i]:italic [&_u]:underline [&_sub]:text-[11px] [&_sup]:text-[11px]"
            // sanitize at author time; render innerHTML is safe here (sanitized on save)
            dangerouslySetInnerHTML={{ __html: question.bodyRichText || "<span class='text-faint'>(empty stem)</span>" }}
          />
          <div className="mt-5 space-y-3">
            {question.questionType === "options"
              ? question.options.map((option) => {
                  const selected = answer.selectedOptionId === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`group flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border p-3 pr-4 transition-colors ${selected ? "border-brand bg-brand/12 shadow-[0_0_0_1px_rgba(91,127,255,0.4)]" : "border-line bg-canvas hover:border-brand/30 hover:bg-line/60"}`}
                    >
                      <input className="peer sr-only" type="radio" name={`question-${question.id}`} checked={selected} onChange={() => updateAnswer(question.id, { selectedOptionId: option.id })} />
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? "border-brand bg-brand text-white" : "border-line bg-panel group-hover:border-brand/40"}`}>
                        {selected && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      <span className={`text-[15px] leading-5 ${selected ? "font-semibold text-ink" : "text-faint"}`}>{option.optionText}</span>
                    </label>
                  );
                })
              : question.blankIndexes.map((blankIndex) => (
                  <label key={blankIndex} className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Blank {blankIndex + 1}</span>
                    <Input
                      placeholder={`Answer for blank ${blankIndex + 1}`}
                      value={answer.blankAnswers?.[String(blankIndex)] ?? ""}
                      onChange={(event) => updateAnswer(question.id, { blankAnswers: { ...answer.blankAnswers, [String(blankIndex)]: event.target.value } })}
                      aria-label={`Answer for blank ${blankIndex + 1}`}
                      className="min-h-11 rounded-xl border-line bg-canvas text-ink placeholder:text-faint focus-visible:ring-brand"
                    />
                  </label>
                ))}
          </div>
        </div>
      </div>

      {/* nav */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-5 text-sm font-semibold text-ink hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}><ChevronLeft className="size-4" /> Previous</button>
        {isLastQuestion ? (
          <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,127,255,0.3)] hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" onClick={() => setSubmitDialogOpen(true)} disabled={submitMutation.isPending || expired}>{submitMutation.isPending ? "Submitting…" : `Submit · ${answeredCount}/${questions.length} answered`}</button>
        ) : (
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,127,255,0.3)] hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setCurrentIndex((i) => i + 1)}>Next<ChevronRight className="size-4" /></button>
        )}
      </div>

      {submitMutation.isError && !expired && <p className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby" role="alert">{submitMutation.error instanceof ApiError ? submitMutation.error.message : "Submission failed — check your connection and try again."}</p>}

      <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <AlertDialogContent className="border-line bg-panel">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">Submit this quiz?</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">You can&apos;t change answers after submitting. {questions.length - answeredCount > 0 ? `${questions.length - answeredCount} question(s) are still unanswered and will be scored as incorrect.` : "All questions have an answer — nice work."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-xl border-line bg-canvas text-ink hover:bg-line">Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={submit} className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover">Submit quiz</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={focusWarningOpen} onOpenChange={setFocusWarningOpen}>
        <AlertDialogContent className="border-line bg-panel">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">You left the quiz</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">Return to continue — your answers are saved locally until you submit.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFocusWarningOpen(false)} className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover">Return to quiz</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={expired} onOpenChange={() => undefined}>
        <AlertDialogContent className="border-line bg-panel">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">Time expired</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">The timer has ended. Submit was not completed in time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => router.push("/history")} className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover">Go to history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildSubmission(answers: Answers, questions: Question[]) {
  return questions.map((question) => ({
    questionId: question.id,
    selectedOptionId: answers[question.id]?.selectedOptionId ?? null,
    blankAnswers: answers[question.id]?.blankAnswers ?? {},
  }));
}
