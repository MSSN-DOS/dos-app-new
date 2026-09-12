"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { ArrowLeft, Sparkles, GraduationCap, Layers, Clock3, Calendar, AlertCircle, Check, SearchX, Plus, Trash2, Search } from "lucide-react";

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
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-2xl bg-line" />
        <Skeleton className="h-40 w-full rounded-2xl bg-line" />
        <Skeleton className="h-64 w-full rounded-2xl bg-line" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="rounded-2xl border border-ruby/30 bg-ruby/10 p-6 text-center">
        <p role="alert" className="text-sm text-ruby">{(detailQuery.error as ApiError).message}</p>
        <Button variant="outline" className="mt-3 rounded-xl border-line bg-panel text-ink" onClick={() => detailQuery.refetch()}>Try again</Button>
      </div>
    );
  }

  return <Builder quiz={detailQuery.data} quizId={quizId} />;
}

function Builder({ quiz, quizId }: { quiz: QuizDetail; quizId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(quiz.title);
  const [instructions, setInstructions] = useState(quiz.instructions ?? "");
  const [questionCount, setQuestionCount] = useState(String(quiz.questionCount));
  const [timeLimit, setTimeLimit] = useState(String(quiz.timeLimitMinutes));
  const [passMark, setPassMark] = useState(String(quiz.passMark));
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState(quiz.allowMultipleAttempts);
  const [loseFocusPolicy, setLoseFocusPolicy] = useState(quiz.loseFocusPolicy);
  const [weekStart, setWeekStart] = useState(quiz.weekStart ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detachTarget, setDetachTarget] = useState<number | null>(null);
  const [bankTopic, setBankTopic] = useState("__all__");
  const [bankType, setBankType] = useState("__all__");
  const [bankTab, setBankTab] = useState<"available" | "attached">("available");
  const [bankSearch, setBankSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detachMany, setDetachMany] = useState<number[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(bankSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [bankSearch]);

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", quiz.courseId != null ? String(quiz.courseId) : ""],
    queryFn: () =>
      apiFetch<{ data: { id: number; title: string; courseCode?: string }[] }>(`/teacher/topics?courseId=${quiz.courseId ?? ""}`).then((r) => r.data ?? []),
    enabled: quiz.courseId != null,
  });

  const bankParams = new URLSearchParams();
  if (quiz.courseId != null) bankParams.set("courseId", String(quiz.courseId));
  if (quiz.jambSubjectId != null) bankParams.set("jambSubjectId", String(quiz.jambSubjectId));
  if (bankTopic !== "__all__") bankParams.set("topicId", bankTopic);
  if (bankType !== "__all__") bankParams.set("type", bankType);
  if (debouncedSearch !== "") bankParams.set("search", debouncedSearch);
  bankParams.set("excludeQuizId", String(quiz.id));

  const bankQuery = useQuery({
    queryKey: ["teacher", "questions", "bank", bankTopic, bankType, debouncedSearch, quiz.courseId, quiz.jambSubjectId],
    queryFn: () => apiFetch<{ data: BankQuestion[] }>(`/teacher/questions?${bankParams.toString()}`).then((r) => r.data ?? []),
  });

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ["teacher", "quiz", quizId] });
  const invalidateQuizzes = () => queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/teacher/quizzes/${quiz.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { setFormError(null); void invalidateDetail(); void invalidateQuizzes(); },
    onError: (err) => setFormError((err as ApiError).message),
  });
  const publishMutation = useMutation({
    mutationFn: () => apiFetch(`/teacher/quizzes/${quiz.id}/publish`, { method: "POST" }),
    onSuccess: () => { setFormError(null); void invalidateDetail(); void invalidateQuizzes(); },
    onError: (err) => setFormError((err as ApiError).message),
  });
  const attachMutation = useMutation({
    mutationFn: (questionId: number) => apiFetch(`/teacher/quizzes/${quiz.id}/questions`, { method: "POST", body: JSON.stringify({ questionId }) }),
    onSuccess: () => { setActionError(null); setSelectedIds([]); void invalidateDetail(); void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] }); },
    onError: (err) => setActionError((err as ApiError).message),
  });
  const attachManyMutation = useMutation({
    mutationFn: (questionIds: number[]) =>
      apiFetch<{ data: { attached: number; skippedAlreadyAttached: number } }>(`/teacher/quizzes/${quiz.id}/questions/bulk`, {
        method: "POST",
        body: JSON.stringify({ questionIds }),
      }),
    onSuccess: (res) => {
      setActionError(null);
      setSelectedIds([]);
      void invalidateDetail();
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      const n = res?.data?.attached ?? 0;
      if (n > 0) toast.success(`Attached ${n} question${n === 1 ? "" : "s"} to the quiz`);
    },
    onError: (err) => setActionError((err as ApiError).message),
  });
  const detachMutation = useMutation({
    mutationFn: (questionId: number) => apiFetch(`/teacher/quizzes/${quiz.id}/questions/${questionId}`, { method: "DELETE" }),
    onSuccess: () => { setActionError(null); setDetachTarget(null); setSelectedIds([]); void invalidateDetail(); void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] }); },
    onError: (err) => { setDetachTarget(null); setActionError((err as ApiError).message); },
  });
  const detachManyMutation = useMutation({
    mutationFn: async (questionIds: number[]) => {
      await Promise.all(questionIds.map((id) => apiFetch(`/teacher/quizzes/${quiz.id}/questions/${id}`, { method: "DELETE" })));
      return questionIds.length;
    },
    onSuccess: (count) => {
      setActionError(null);
      setDetachMany(null);
      setDetachTarget(null);
      setSelectedIds([]);
      void invalidateDetail();
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      toast.success(`Removed ${count} question${count === 1 ? "" : "s"} from the quiz`);
    },
    onError: (err) => { setDetachMany(null); setDetachTarget(null); setActionError((err as ApiError).message); },
  });

  const attachedIds = new Set(quiz.questions.map((q) => q.questionId));
  const isCourse = quiz.quizType === "course";
  const parsedCount = Number(questionCount);
  const parsedTime = Number(timeLimit);
  const parsedPass = Number(passMark);

  const blockers: string[] = [];
  if (title.trim() === "") blockers.push("Give the quiz a title");
  if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 100) blockers.push("Question count must be between 1 and 100");
  if (!Number.isInteger(parsedTime) || parsedTime < 1 || parsedTime > 600) blockers.push("Time limit must be between 1 and 600 minutes");
  if (!Number.isInteger(parsedPass) || parsedPass < 1 || parsedPass > 100) blockers.push("Pass mark must be between 1 and 100 percent");
  if (isCourse && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) blockers.push("Pick a Saturday week start date");
  if (attachedIds.size < (isCourse ? 50 : parsedCount)) blockers.push(`Attach ${Math.max(0, (isCourse ? 50 : parsedCount) - attachedIds.size)} more question(s) (${attachedIds.size} of ${isCourse ? 50 : parsedCount})`);

  const configValid =
    title.trim() !== "" &&
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 100 &&
    Number.isInteger(parsedTime) && parsedTime >= 1 && parsedTime <= 600 &&
    Number.isInteger(parsedPass) && parsedPass >= 1 && parsedPass <= 100 &&
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

  const attachedCount = attachedIds.size;
  const requiredCount = isCourse ? 50 : parsedCount;
  const progress = Math.min(100, Math.round((attachedCount / Math.max(1, requiredCount)) * 100));

  const attachedRows = quiz.questions;
  const attachedIdSet = new Set(attachedRows.map((q) => q.questionId));
  const availableRows = bankQuery.data ?? [];
  const attachableAvailable = availableRows.filter((q) => q.status === "published");
  const attachableIdSet = new Set(attachableAvailable.map((q) => q.id));
  const selectedAvailable = selectedIds.filter((id) => attachableIdSet.has(id));
  const selectedAttached = selectedIds.filter((id) => attachedIdSet.has(id));
  const allAvailableSelected = attachableAvailable.length > 0 && selectedAvailable.length === attachableAvailable.length;
  const allAttachedSelected = attachedRows.length > 0 && selectedAttached.length === attachedRows.length;

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleAllAvailable = () => {
    if (allAvailableSelected) {
      setSelectedIds((prev) => prev.filter((id) => !attachableIdSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...attachableAvailable.map((q) => q.id)])));
    }
  };
  const toggleAllAttached = () => {
    if (allAttachedSelected) {
      setSelectedIds((prev) => prev.filter((id) => !attachedIdSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...attachedRows.map((q) => q.questionId)])));
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/teacher/quizzes")} className="min-h-9 gap-1.5 rounded-xl bg-panel text-sub hover:bg-line hover:text-ink">
          <ArrowLeft className="size-4" /> All quizzes
        </Button>
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="h-1 w-full bg-gradient-to-r from-brand via-brand/60 to-gold/60" />
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${isCourse ? "border-brand/30 bg-brand/15 text-brand-soft" : "border-gold/30 bg-gold/15 text-gold"}`}>
                    {isCourse ? <GraduationCap className="size-3.5" /> : <Layers className="size-3.5" />}
                    {isCourse ? "Course Quiz" : "Topic Quiz"}
                  </span>
                  <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-sub">{quiz.courseCode ?? quiz.subjectName ?? "—"}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${quiz.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{quiz.status === "published" ? "Published" : "Draft"}</span>
                </div>
                <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
                  {quiz.title}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-sub">
                  <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" /> Week {quiz.weekStart ?? "—"}</span>
                  <span className="text-line">·</span>
                  <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {quiz.timeLimitMinutes} min · {quiz.passMark}% to pass</span>
                </p>
              </div>
              <div className="shrink-0 rounded-2xl border border-line bg-canvas px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Attached</p>
                <p className="mt-1 text-xl font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>{attachedCount} / {requiredCount}</p>
                <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* settings */}
      <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          <span className="flex size-7 items-center justify-center rounded-xl bg-brand/15 text-brand"><Sparkles className="size-3.5" /></span>
          Quiz settings
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-sub">Course quizzes are fixed at 50 questions and a Saturday week start. Topic quizzes are free-form.</p>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="quiz-title" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Title</Label>
            <Input id="quiz-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Organic Chemistry — Alkanes" className="min-h-11 rounded-xl border-line bg-canvas text-ink placeholder:text-faint" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quiz-instructions" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Instructions <span className="font-normal normal-case tracking-normal text-faint">— shown before start</span></Label>
            <textarea id="quiz-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} rows={3} className="min-h-11 rounded-xl border border-line bg-canvas px-3 py-3 text-[14px] leading-5 text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" placeholder="e.g. Answer all questions. No external aids. You have one attempt." />
            <p className="text-[11px] text-faint">{instructions.length} / 5000</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-count" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Questions</Label>
              {isCourse ? <Input id="quiz-count" value={50} disabled readOnly className="min-h-11 rounded-xl border-line bg-canvas text-faint" /> : <Input id="quiz-count" type="number" min={1} max={100} value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} className="min-h-11 rounded-xl border-line bg-canvas text-ink" />}
              {isCourse && <p className="text-[11px] text-faint">Fixed to 50 for Course Quizzes</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-time" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Time limit (min)</Label>
              <Input id="quiz-time" type="number" min={1} max={600} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className="min-h-11 rounded-xl border-line bg-canvas text-ink" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quiz-pass" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Pass mark (%)</Label>
              <Input id="quiz-pass" type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} className="min-h-11 rounded-xl border-line bg-canvas text-ink" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-3">
            <Checkbox id="quiz-multi" checked={allowMultipleAttempts} onCheckedChange={(v) => setAllowMultipleAttempts(v === true)} className="border-line data-[state=checked]:bg-brand data-[state=checked]:border-brand" />
            <span className="text-sm font-medium text-ink">Multiple attempts allowed <span className="font-normal text-sub">— reshuffles questions each attempt</span></span>
          </label>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Lose-focus policy</Label>
            <Select value={loseFocusPolicy} onValueChange={(v) => setLoseFocusPolicy(v as "ignore" | "warn" | "auto_submit")}>
              <SelectTrigger className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue /></SelectTrigger>
              <SelectContent className="border-line bg-panel text-ink">
                <SelectItem value="ignore">Ignore — allow tab switches</SelectItem>
                <SelectItem value="warn">Warn — show a return-to-quiz dialog</SelectItem>
                <SelectItem value="auto_submit">Auto-submit — ends attempt on leave</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCourse && (
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="quiz-week" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Week start (Saturday)</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input id="quiz-week" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="min-h-11 rounded-xl border-line bg-canvas pl-9 text-ink" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* attach */}
      <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>Attach questions</h2>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-sub">{attachedCount} of {requiredCount} attached · {progress}%</span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-gold transition-all" style={{ width: `${progress}%` }} />
        </div>

        {actionError && <p role="alert" className="mt-3 rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{actionError}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5" role="tablist" aria-label="Question source">
          <button type="button" role="tab" aria-selected={bankTab === "available"} onClick={() => { setBankTab("available"); setSelectedIds([]); }} className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${bankTab === "available" ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"}`}>
            Available bank
          </button>
          <button type="button" role="tab" aria-selected={bankTab === "attached"} onClick={() => { setBankTab("attached"); setSelectedIds([]); }} className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${bankTab === "attached" ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"}`}>
            Attached · {attachedCount}
          </button>
        </div>

        {bankTab === "available" ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select value={bankTopic} onValueChange={(v) => { setBankTopic(v); setSelectedIds([]); }}>
                <SelectTrigger aria-label="Filter bank by topic" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="All topics" /></SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  <SelectItem value="__all__">All topics</SelectItem>
                  {topicsQuery.data?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bankType} onValueChange={(v) => { setBankType(v); setSelectedIds([]); }}>
                <SelectTrigger aria-label="Filter bank by type" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  <SelectItem value="__all__">All types</SelectItem>
                  <SelectItem value="options">Options</SelectItem>
                  <SelectItem value="fill_in_gap">Fill in the gap</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input value={bankSearch} onChange={(e) => { setBankSearch(e.target.value); setSelectedIds([]); }} placeholder="Search question text…" aria-label="Search the question bank" className="min-h-11 w-full rounded-xl border-line bg-canvas pl-9 text-ink placeholder:text-faint" />
              </div>
            </div>

            {bankQuery.isPending ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading the question bank">
                <Skeleton className="h-16 w-full rounded-xl bg-line" />
                <Skeleton className="h-16 w-full rounded-xl bg-line" />
                <Skeleton className="h-16 w-full rounded-xl bg-line" />
              </div>
            ) : bankQuery.isError ? (
              <div className="rounded-xl border border-ruby/30 bg-ruby/10 p-4">
                <p role="alert" className="text-sm text-ruby">{(bankQuery.error as ApiError).message}</p>
                <Button variant="outline" size="sm" className="mt-2 min-h-9 rounded-xl border-line bg-panel text-ink" onClick={() => bankQuery.refetch()}>Try again</Button>
              </div>
            ) : availableRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-8 text-center">
                <SearchX className="mx-auto size-6 text-faint" />
                <p className="mt-2 text-sm font-medium text-ink">Nothing left to attach.</p>
                <p className="mt-1 text-xs text-sub">Every matching question is already attached to this quiz. Try a broader search — or publish fresh ones in the Question Bank.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sub">
                    <Checkbox checked={allAvailableSelected} onCheckedChange={toggleAllAvailable} aria-label="Select all published questions in this view" className="border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand" />
                    Select all ({attachableAvailable.length})
                  </label>
                  <p className="text-[11px] text-faint">Only published questions attach to a quiz.</p>
                  <div className="ml-auto flex items-center gap-2">
                    {selectedAvailable.length > 0 && <span className="text-[11px] font-semibold text-brand-soft" style={{ fontFamily: "JetBrains Mono, monospace" }}>{selectedAvailable.length} selected</span>}
                    <Button size="sm" className="min-h-9 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40" disabled={selectedAvailable.length === 0 || attachManyMutation.isPending} onClick={() => attachManyMutation.mutate(selectedAvailable)}>
                      {attachManyMutation.isPending ? <><Plus className="size-3.5 animate-pulse" /> Attaching…</> : <><Plus className="size-3.5" /> Attach {selectedAvailable.length || "selected"}</>}
                    </Button>
                  </div>
                </div>

                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                  {availableRows.map((q) => {
                    const attachable = q.status === "published";
                    const isSelected = selectedIds.includes(q.id);
                    return (
                      <li key={q.id} className="flex items-center gap-3 p-3 sm:p-4">
                        <Checkbox checked={isSelected} disabled={!attachable} onCheckedChange={() => toggleRow(q.id)} aria-label={attachable ? `Select question ${q.id} to attach` : "Draft questions cannot be attached yet"} className="shrink-0 border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-30" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{stripTags(q.bodyRichText) || "(empty draft)"}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-sub">
                            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium">{TYPE_LABEL[q.questionType]}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${q.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{q.status === "published" ? "Published" : "Draft"}</span>
                          </p>
                        </div>
                        {attachable ? (
                          <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={attachMutation.isPending} onClick={() => attachMutation.mutate(q.id)}><Plus className="size-3.5" /> Add</Button>
                        ) : (
                          <span className="shrink-0 text-[11px] font-medium text-faint">Publish to attach</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {attachedRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-8 text-center">
                <SearchX className="mx-auto size-6 text-faint" />
                <p className="mt-2 text-sm font-medium text-ink">No questions attached yet.</p>
                <p className="mt-1 text-xs text-sub">Jump to the Available bank, tick a few rows and attach them in one go.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sub">
                    <Checkbox checked={allAttachedSelected} onCheckedChange={toggleAllAttached} aria-label="Select all attached questions" className="border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand" />
                    Select all ({attachedRows.length})
                  </label>
                  <div className="ml-auto flex items-center gap-2">
                    {selectedAttached.length > 0 && <span className="text-[11px] font-semibold text-ruby" style={{ fontFamily: "JetBrains Mono, monospace" }}>{selectedAttached.length} selected</span>}
                    <Button variant="outline" size="sm" className="min-h-9 rounded-xl border-ruby/40 bg-canvas text-ruby hover:bg-ruby/10 disabled:opacity-40" disabled={selectedAttached.length === 0} onClick={() => setDetachMany(selectedAttached)}>
                      <Trash2 className="size-3.5" /> Remove {selectedAttached.length || "selected"}
                    </Button>
                  </div>
                </div>

                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                  {attachedRows.map((q) => {
                    const isSelected = selectedIds.includes(q.questionId);
                    return (
                      <li key={q.questionId} className="flex items-center gap-3 p-3 sm:p-4">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(q.questionId)} aria-label={`Select question ${q.questionId} to detach`} className="shrink-0 border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{stripTags(q.bodyRichText) || "(empty draft)"}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-sub">
                            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium">{TYPE_LABEL[q.questionType]}</span>
                            {q.topicId != null && <span className="text-[11px] text-faint">topic {q.topicId}</span>}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="min-h-9 shrink-0 rounded-xl text-ruby hover:bg-ruby/10 hover:text-ruby" onClick={() => setDetachTarget(q.questionId)}><Trash2 className="size-3.5" /> Remove</Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {formError && <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{formError}</p>}

      {blockers.length > 0 ? (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-gold"><AlertCircle className="size-4" /> Publishing is blocked until:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gold/90">
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm font-medium text-brand-soft">
          <Check className="size-4" /> Ready to publish — all requirements met.
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(buildBody())}>Save as draft</Button>
        {quiz.status === "draft" ? (
          <Button className="min-h-11 rounded-xl bg-brand text-white shadow-[0_8px_20px_rgba(91,127,255,0.3)] hover:bg-brand-hover disabled:opacity-40" disabled={publishMutation.isPending || !configValid || blockers.length > 0} onClick={() => publishMutation.mutate()}><Sparkles className="size-4" /> Publish quiz</Button>
        ) : (
          <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-line px-4 text-sm font-semibold text-sub"><Check className="size-4" /> Published — visible to students</span>
        )}
      </div>

      <AlertDialog open={detachTarget !== null || detachMany !== null} onOpenChange={(open) => { if (!open) { setDetachTarget(null); setDetachMany(null); } }}>
        <AlertDialogContent className="border-line bg-panel text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">{detachMany ? `Remove ${detachMany.length} question${detachMany.length === 1 ? "" : "s"} from this quiz?` : "Remove question from quiz?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">The question{detachMany ? "s stay" : " stays"} in the bank but will no longer appear in this quiz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-canvas text-ink hover:bg-line" disabled={detachManyMutation.isPending || detachMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-ruby text-white hover:bg-ruby-hover" disabled={detachManyMutation.isPending || detachMutation.isPending} onClick={(e) => { e.preventDefault(); if (detachMany !== null) detachManyMutation.mutate(detachMany); else if (detachTarget !== null) detachMutation.mutate(detachTarget); }}>
              {detachManyMutation.isPending || detachMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
