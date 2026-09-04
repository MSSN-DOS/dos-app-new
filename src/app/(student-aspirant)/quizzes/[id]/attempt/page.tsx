"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      apiFetch<{ data: { attemptId: number; scoreStatus: "held"; message: string } }>(
        `/quizzes/${quizId}/attempt`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      submittedRef.current = true;
    },
    onError: (error) => {
      submittedRef.current = false;
      if (error instanceof ApiError && error.status === 409) setExpired(true);
    },
  });

  const attempt = attemptQuery.data?.data;
  const questions = attempt?.questions ?? NO_QUESTIONS;
  const question = questions[currentIndex];
  const expiresAt = attempt
    ? new Date(attempt.startedAt).getTime() + attempt.timeLimitMinutes * 60_000
    : 0;
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isLastQuestion = currentIndex === questions.length - 1;

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
    return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-72 w-full" /></div>;
  }

  if (attemptQuery.isError) {
    const message = attemptQuery.error instanceof ApiError ? attemptQuery.error.message : "Unable to load this quiz";
    return <div className="mx-auto max-w-xl"><Card><CardHeader><CardTitle>Quiz unavailable</CardTitle><CardDescription>{message}</CardDescription></CardHeader><CardContent><Button onClick={() => attemptQuery.refetch()}>Try again</Button></CardContent></Card></div>;
  }

  if (submitMutation.isSuccess) {
    return <div className="mx-auto max-w-xl"><Card><CardHeader><CheckCircle2 className="size-8 text-primary" /><CardTitle>Submission received</CardTitle><CardDescription>Your score is pending release by an administrator.</CardDescription></CardHeader><CardContent><Button onClick={() => router.push("/history")}>Go to history</Button></CardContent></Card></div>;
  }

  if (!attempt || !question) {
    return <div className="mx-auto max-w-xl"><Card><CardHeader><CardTitle>No questions available</CardTitle><CardDescription>This quiz has no published questions yet.</CardDescription></CardHeader></Card></div>;
  }

  const answer = answers[question.id] ?? {};
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm text-muted-foreground">Quiz attempt {attempt.attemptId}</p><h1 className="text-2xl font-semibold tracking-tight">{attempt.title}</h1></div>
        <div className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${remainingSeconds <= 60 ? "border-destructive text-destructive" : "border-border"}`} aria-live="polite"><Clock3 className="size-4" />{formatRemaining(remainingSeconds)} remaining</div>
      </div>

      {attempt.instructions && <p className="text-base text-muted-foreground">{attempt.instructions}</p>}
      {remainingSeconds <= 60 && <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="status"><AlertTriangle className="size-4 shrink-0" />Time is almost up. Your answers must be submitted before the timer expires.</div>}

      <Card>
        <CardHeader><CardDescription>Question {currentIndex + 1} of {questions.length}</CardDescription><CardTitle className="text-lg leading-7">{stripTags(question.bodyRichText)}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {question.questionType === "options" ? question.options.map((option) => (
            <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input className="size-4 accent-primary" type="radio" name={`question-${question.id}`} checked={answer.selectedOptionId === option.id} onChange={() => updateAnswer(question.id, { selectedOptionId: option.id })} />
              <span className="text-base">{option.optionText}</span>
            </label>
          )) : question.blankIndexes.map((blankIndex) => (
            <label key={blankIndex} className="block space-y-2 text-base">Blank {blankIndex}<Input value={answer.blankAnswers?.[String(blankIndex)] ?? ""} onChange={(event) => updateAnswer(question.id, { blankAnswers: { ...answer.blankAnswers, [String(blankIndex)]: event.target.value } })} aria-label={`Answer for blank ${blankIndex}`} /></label>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => index - 1)}><ChevronLeft />Previous</Button>
        {isLastQuestion ? <Button className="min-h-11" onClick={() => setSubmitDialogOpen(true)} disabled={submitMutation.isPending || expired}>{submitMutation.isPending ? "Submitting..." : "Submit quiz"}</Button> : <Button className="min-h-11" onClick={() => setCurrentIndex((index) => index + 1)}>Next question<ChevronRight /></Button>}
      </div>

      {submitMutation.isError && !expired && <p className="text-sm text-destructive" role="alert">{submitMutation.error instanceof ApiError ? submitMutation.error.message : "Submission failed. Please try again."}</p>}

      <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Submit this quiz?</AlertDialogTitle><AlertDialogDescription>You cannot change this attempt after submitting. Unanswered questions will be marked incorrect.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep reviewing</AlertDialogCancel><AlertDialogAction onClick={submit}>Submit quiz</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={focusWarningOpen} onOpenChange={setFocusWarningOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Quiz window left</AlertDialogTitle><AlertDialogDescription>You left the quiz. Return to continue; your answers are only submitted when you finish.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogAction onClick={() => setFocusWarningOpen(false)}>Return to quiz</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={expired} onOpenChange={() => undefined}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Time expired</AlertDialogTitle><AlertDialogDescription>The quiz timer has ended. Submit was not completed in time.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogAction onClick={() => router.push("/history")}>Go to history</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
