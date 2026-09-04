"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

type QuizDetail = {
  id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  quizType: "topic" | "course";
  courseId: number | null;
  topicId: number | null;
  jambSubjectId: number | null;
  weekStart: string | null;
  questionCount: number;
  timeLimitMinutes: number;
  passMark: number;
  allowMultipleAttempts: boolean;
  loseFocusPolicy: "ignore" | "warn" | "auto_submit";
  status: "draft" | "published";
  courseCode: string | null;
  subjectName: string | null;
  questions: {
    questionId: number;
    bodyRichText: string;
    questionType: "fill_in_gap" | "options";
    topicId: number | null;
    status: string;
  }[];
};

type BankQuestion = {
  id: number;
  bodyRichText: string;
  questionType: "fill_in_gap" | "options";
  status: string;
};

const TYPE_LABEL: Record<string, string> = {
  fill_in_gap: "Fill in the gap",
  options: "Options",
};

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function QuizBuilderPage() {
  return <QuizBuilderInner />;
}

function QuizBuilderInner() {
  const params = useParams<{ id: string }>();
  const quizId = params.id;

  const detailQuery = useQuery({
    queryKey: ["teacher", "quiz", quizId],
    queryFn: () => apiFetch<QuizDetail>(`/teacher/quizzes/${quizId}`),
  });

  if (detailQuery.isPending) {
    return (
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <div role="alert" className="text-sm text-destructive">
          {(detailQuery.error as ApiError).message}
        </div>
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => detailQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  return <Builder quiz={detailQuery.data} quizId={quizId} />;
}

function Builder({ quiz, quizId }: { quiz: QuizDetail; quizId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Config form state seeded once from the loaded detail (no effects needed:
  // this component mounts only after the query resolves).
  const [title, setTitle] = useState(quiz.title);
  const [instructions, setInstructions] = useState(quiz.instructions ?? "");
  const [questionCount, setQuestionCount] = useState(String(quiz.questionCount));
  const [timeLimit, setTimeLimit] = useState(String(quiz.timeLimitMinutes));
  const [passMark, setPassMark] = useState(String(quiz.passMark));
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState(
    quiz.allowMultipleAttempts,
  );
  const [loseFocusPolicy, setLoseFocusPolicy] = useState(quiz.loseFocusPolicy);
  const [weekStart, setWeekStart] = useState(quiz.weekStart ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detachTarget, setDetachTarget] = useState<number | null>(null);

  // Bank search filters (topic + type per spec).
  const [bankTopic, setBankTopic] = useState("__all__");
  const [bankType, setBankType] = useState("__all__");

  const topicsQuery = useQuery({
    queryKey: [
      "teacher",
      "topics",
      quiz.courseId != null ? String(quiz.courseId) : "",
    ],
    queryFn: () =>
      apiFetch<{ data: { id: number; title: string; courseCode?: string }[] }>(
        `/teacher/topics?courseId=${quiz.courseId ?? ""}`,
      ).then((r) => r.data ?? []),
    enabled: quiz.courseId != null,
  });

  const bankParams = new URLSearchParams();
  if (quiz.courseId != null) bankParams.set("courseId", String(quiz.courseId));
  if (quiz.jambSubjectId != null)
    bankParams.set("jambSubjectId", String(quiz.jambSubjectId));
  if (bankTopic !== "__all__") bankParams.set("topicId", bankTopic);
  if (bankType !== "__all__") bankParams.set("type", bankType);

  const bankQuery = useQuery({
    queryKey: ["teacher", "questions", bankTopic, bankType],
    queryFn: () =>
      apiFetch<{ data: BankQuestion[] }>(
        `/teacher/questions?${bankParams.toString()}`,
      ).then((r) => r.data ?? []),
  });

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: ["teacher", "quiz", quizId] });
  const invalidateQuizzes = () =>
    queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/teacher/quizzes/${quiz.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setFormError(null);
      void invalidateDetail();
      void invalidateQuizzes();
    },
    onError: (err) => setFormError((err as ApiError).message),
  });

  const publishMutation = useMutation({
    mutationFn: () => apiFetch(`/teacher/quizzes/${quiz.id}/publish`, { method: "POST" }),
    onSuccess: () => {
      setFormError(null);
      void invalidateDetail();
      void invalidateQuizzes();
    },
    onError: (err) => setFormError((err as ApiError).message),
  });

  const attachMutation = useMutation({
    mutationFn: (questionId: number) =>
      apiFetch(`/teacher/quizzes/${quiz.id}/questions`, {
        method: "POST",
        body: JSON.stringify({ questionId }),
      }),
    onSuccess: () => {
      setActionError(null);
      void invalidateDetail();
    },
    onError: (err) => setActionError((err as ApiError).message),
  });

  const detachMutation = useMutation({
    mutationFn: (questionId: number) =>
      apiFetch(`/teacher/quizzes/${quiz.id}/questions/${questionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setActionError(null);
      setDetachTarget(null);
      void invalidateDetail();
    },
    onError: (err) => {
      setDetachTarget(null);
      setActionError((err as ApiError).message);
    },
  });

  const attachedIds = new Set(quiz.questions.map((q) => q.questionId));
  const isCourse = quiz.quizType === "course";
  const parsedCount = Number(questionCount);
  const parsedTime = Number(timeLimit);
  const parsedPass = Number(passMark);

  const blockers: string[] = [];
  if (title.trim() === "") blockers.push("Give the quiz a title");
  if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 100)
    blockers.push("Question count must be between 1 and 100");
  if (!Number.isInteger(parsedTime) || parsedTime < 1 || parsedTime > 600)
    blockers.push("Time limit must be between 1 and 600 minutes");
  if (!Number.isInteger(parsedPass) || parsedPass < 1 || parsedPass > 100)
    blockers.push("Pass mark must be between 1 and 100 percent");
  if (isCourse && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
    blockers.push("Pick a Saturday week start date");
  if (attachedIds.size < (isCourse ? 50 : parsedCount))
    blockers.push(
      `Attach ${Math.max(0, (isCourse ? 50 : parsedCount) - attachedIds.size)} more question(s) (${attachedIds.size} of ${isCourse ? 50 : parsedCount})`,
    );

  const configValid =
    title.trim() !== "" &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= 100 &&
    Number.isInteger(parsedTime) &&
    parsedTime >= 1 &&
    parsedTime <= 600 &&
    Number.isInteger(parsedPass) &&
    parsedPass >= 1 &&
    parsedPass <= 100 &&
    (!isCourse || /^\d{4}-\d{2}-\d{2}$/.test(weekStart));

  function buildBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      title: title.trim(),
      instructions: instructions.trim(),
      questionCount: parsedCount,
      timeLimitMinutes: parsedTime,
      passMark: parsedPass,
      allowMultipleAttempts,
      loseFocusPolicy,
    };
    if (isCourse) body.weekStart = weekStart;
    return body;
  }

  return (
    <div className="flex-1 space-y-8 p-4 pb-24 sm:p-6">
      <header>
        <Button variant="ghost" size="sm" onClick={() => router.push("/teacher/quizzes")} className="mb-2 min-h-9">
          ← All quizzes
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isCourse ? "Course Quiz" : "Topic Quiz"} —{" "}
          {quiz.courseCode ?? quiz.subjectName ?? ""}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          Week of {quiz.weekStart ?? "—"}
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              quiz.status === "published"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {quiz.status === "published" ? "Published" : "Draft"}
          </span>
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Quiz settings</h2>
        <div className="grid gap-4 sm:max-w-xl">
          <div className="grid gap-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quiz-instructions">Instructions</Label>
            <textarea
              id="quiz-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={5000}
              rows={3}
              className="min-h-11 rounded-md border border-input bg-transparent px-3 py-2 text-base md:text-sm"
              placeholder="Shown to students before they start"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-count">Questions</Label>
              {isCourse ? (
                <Input id="quiz-count" value={50} disabled readOnly />
              ) : (
                <Input
                  id="quiz-count"
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-time">Time limit (min)</Label>
              <Input
                id="quiz-time"
                type="number"
                min={1}
                max={600}
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-pass">Pass mark (%)</Label>
              <Input
                id="quiz-pass"
                type="number"
                min={1}
                max={100}
                value={passMark}
                onChange={(e) => setPassMark(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="quiz-multi"
              checked={allowMultipleAttempts}
              onCheckedChange={(v) => setAllowMultipleAttempts(v === true)}
            />
            <Label htmlFor="quiz-multi">Multiple attempts allowed</Label>
          </div>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label>Lose-focus policy</Label>
            <Select
              value={loseFocusPolicy}
              onValueChange={(v) =>
                setLoseFocusPolicy(v as "ignore" | "warn" | "auto_submit")
              }
            >
              <SelectTrigger className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ignore">Ignore</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="auto_submit">Auto-submit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCourse ? (
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="quiz-week">Week start (Saturday)</Label>
              <Input
                id="quiz-week"
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">Attach questions</h2>
          <p className="text-sm text-muted-foreground">
            {attachedIds.size} of {isCourse ? 50 : parsedCount} questions attached
          </p>
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={bankTopic} onValueChange={setBankTopic}>
            <SelectTrigger className="min-h-11 w-full sm:w-56">
              <SelectValue placeholder="All topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All topics</SelectItem>
              {topicsQuery.data?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bankType} onValueChange={setBankType}>
            <SelectTrigger className="min-h-11 w-full sm:w-56">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              <SelectItem value="options">Options</SelectItem>
              <SelectItem value="fill_in_gap">Fill in the gap</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {bankQuery.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : bankQuery.isError ? (
          <div>
            <p role="alert" className="text-sm text-destructive">
              {(bankQuery.error as ApiError).message}
            </p>
            <Button variant="outline" size="sm" className="mt-2 min-h-9" onClick={() => bankQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : bankQuery.data.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No questions in the bank match these filters.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {bankQuery.data.map((q) => {
              const attached = attachedIds.has(q.id);
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {stripTags(q.bodyRichText) || "(empty draft)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[q.questionType]} ·{" "}
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          q.status === "published"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {q.status === "published" ? "Published" : "Draft"}
                      </span>
                    </p>
                  </div>
                  {attached ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9 shrink-0 text-destructive"
                      onClick={() => setDetachTarget(q.id)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9 shrink-0"
                      disabled={attachMutation.isPending}
                      onClick={() => attachMutation.mutate(q.id)}
                    >
                      + Add to quiz
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <div className="rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm">
          <p className="font-medium">Publishing is blocked until:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(buildBody())}
        >
          Save as draft
        </Button>
        {quiz.status === "draft" ? (
          <Button
            className="min-h-11"
            disabled={
              publishMutation.isPending ||
              !configValid ||
              blockers.length > 0
            }
            onClick={() => publishMutation.mutate()}
          >
            Publish
          </Button>
        ) : null}
      </div>

      <AlertDialog
        open={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetachTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove question from quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              The question stays in the bank but will no longer appear in this
              quiz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => detachTarget !== null && detachMutation.mutate(detachTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
