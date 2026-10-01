"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
import { QuizAvailabilityPanel } from "@/components/admin/quiz-availability-panel";
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
import {
  attachProgress,
  buildQuizPatch,
  publishBlockers,
  requiredQuestionCount,
  type BuilderForm,
} from "@/lib/quizzes/builder-validation";
import { ArrowLeft, Sparkles, GraduationCap, Layers, Clock3, Calendar, AlertCircle, Check, Undo2 } from "lucide-react";

import {
  QuizAttachSection,
  useDebouncedBankSearch,
  type BankFilters,
  type BankQuestion,
} from "./quiz-attach-section";

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
  opensAt: string | null;
  closesAt: string | null;
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

// Shared by /teacher/quizzes/[id] and /admin/quizzes/[id] — the API is
// role-guarded admin+teacher, so the same UI serves both shells.
export function QuizBuilderView({ basePath }: { basePath: string }) {
  return <QuizBuilderInner basePath={basePath} />;
}

function QuizBuilderInner({ basePath }: { basePath: string }) {
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

  return <Builder quiz={detailQuery.data} quizId={quizId} basePath={basePath} />;
}

function Builder({ quiz, quizId, basePath }: { quiz: QuizDetail; quizId: string; basePath: string }) {
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
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [bankFilters, setBankFilters] = useState<BankFilters>({
    topic: "__all__",
    type: "__all__",
    search: "",
  });
  const [detachMany, setDetachMany] = useState<number[] | null>(null);

  // Ticking selection of bank rows now lives inside QuizAttachSection, so the parent cannot clear
  // it directly. A successful attach/detach bumps this key and the section clears itself — the
  // parent's equivalent of the old setSelectedIds([]), without lifting the state back up.
  const [selectionResetKey, setSelectionResetKey] = useState(0);

  // The debounced search lives here, not in the section, because the bank query below is keyed on
  // it: if the section owned the debounce, the parent's query would fire on every keystroke while
  // the section displayed stale results for 300ms.
  const debouncedSearch = useDebouncedBankSearch(bankFilters.search);

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", quiz.courseId != null ? String(quiz.courseId) : ""],
    queryFn: () =>
      apiFetch<{ data: { id: number; title: string; courseCode?: string }[] }>(`/teacher/topics?courseId=${quiz.courseId ?? ""}`).then((r) => r.data ?? []),
    enabled: quiz.courseId != null,
  });

  const bankParams = new URLSearchParams();
  if (quiz.courseId != null) bankParams.set("courseId", String(quiz.courseId));
  if (quiz.jambSubjectId != null) bankParams.set("jambSubjectId", String(quiz.jambSubjectId));
  if (bankFilters.topic !== "__all__") bankParams.set("topicId", bankFilters.topic);
  if (bankFilters.type !== "__all__") bankParams.set("type", bankFilters.type);
  if (debouncedSearch !== "") bankParams.set("search", debouncedSearch);
  bankParams.set("excludeQuizId", String(quiz.id));

  const bankQuery = useQuery({
    queryKey: ["teacher", "questions", "bank", bankFilters.topic, bankFilters.type, debouncedSearch, quiz.courseId, quiz.jambSubjectId],
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
  const unpublishMutation = useMutation({
    mutationFn: () => apiFetch<{ finalizedAttempts: number }>(`/teacher/quizzes/${quiz.id}/unpublish`, { method: "POST" }),
    onSuccess: (result) => {
      setFormError(null);
      setUnpublishOpen(false);
      // Say it plainly when attempts were closed out. Silently returning a teacher to the draft
      // screen after their click killed a student's open attempt is the behaviour R-1 was filed
      // about; the number is now in the response so it can be reported rather than swallowed.
      toast.success(
        result.finalizedAttempts > 0
          ? `Quiz unpublished — ${result.finalizedAttempts} in-progress attempt${result.finalizedAttempts === 1 ? "" : "s"} submitted at 0`
          : "Quiz unpublished — back to draft",
      );
      void invalidateDetail();
      void invalidateQuizzes();
    },
    onError: (err) => setFormError((err as ApiError).message),
  });
  const attachMutation = useMutation({
    mutationFn: (questionId: number) => apiFetch(`/teacher/quizzes/${quiz.id}/questions`, { method: "POST", body: JSON.stringify({ questionId }) }),
    onSuccess: () => { setActionError(null); setSelectionResetKey((k) => k + 1); void invalidateDetail(); void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] }); },
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
      setSelectionResetKey((k) => k + 1);
      void invalidateDetail();
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      const n = res?.data?.attached ?? 0;
      if (n > 0) toast.success(`Attached ${n} question${n === 1 ? "" : "s"} to the quiz`);
    },
    onError: (err) => setActionError((err as ApiError).message),
  });
  const detachMutation = useMutation({
    mutationFn: (questionId: number) => apiFetch(`/teacher/quizzes/${quiz.id}/questions/${questionId}`, { method: "DELETE" }),
    onSuccess: () => { setActionError(null); setDetachTarget(null); setSelectionResetKey((k) => k + 1); void invalidateDetail(); void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] }); },
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
      setSelectionResetKey((k) => k + 1);
      void invalidateDetail();
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      toast.success(`Removed ${count} question${count === 1 ? "" : "s"} from the quiz`);
    },
    onError: (err) => { setDetachMany(null); setDetachTarget(null); setActionError((err as ApiError).message); },
  });

  const attachedRows = quiz.questions;
  const attachedCount = attachedRows.length;
  const isCourse = quiz.quizType === "course";
  const isAdmin = basePath.startsWith("/admin");


  const availableRows = bankQuery.data ?? [];
  // Only published questions attach. The server enforces this too; filtering here keeps the UI
  // from offering a row whose attach would be rejected.
  const attachableAvailable = availableRows.filter((q) => q.status === "published");

  // One form object, so the rules in builder-validation see exactly the state the inputs hold.
  const form: BuilderForm = {
    title,
    instructions,
    questionCount,
    timeLimit,
    passMark,
    allowMultipleAttempts,
    loseFocusPolicy,
    weekStart,
    quizType: quiz.quizType,
  };

  const blockers = publishBlockers(form, attachedCount);
  const requiredCount = requiredQuestionCount(form, attachedCount);
  const progress = attachProgress(form, attachedCount);

  return (
    <div className="space-y-6 pb-8">
      {/* header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(basePath)} className="min-h-9 gap-1.5 rounded-xl bg-panel text-sub hover:bg-line hover:text-ink">
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

      {/* Admin-only: Course Quiz availability override (DESIGN.md §4 decision 6).
          Teachers never see this — only /admin/quizzes renders it. */}
      {isAdmin && isCourse && (
        <QuizAvailabilityPanel
          quizId={quiz.id}
          weekStart={quiz.weekStart}
          opensAt={quiz.opensAt}
          closesAt={quiz.closesAt}
        />
      )}

      <QuizAttachSection
        form={form}
        attachedRows={attachedRows}
        availableRows={availableRows}
        topics={topicsQuery.data ?? []}
        filters={bankFilters}
        onFiltersChange={(next) => setBankFilters((prev) => ({ ...prev, ...next }))}
        bankState={{
          isPending: bankQuery.isPending,
          isError: bankQuery.isError,
          error: bankQuery.error,
          refetch: () => void bankQuery.refetch(),
        }}
        attachable={attachableAvailable}
        actionError={actionError}
        attachPending={attachMutation.isPending}
        attachManyPending={attachManyMutation.isPending}
        resetSelectionKey={selectionResetKey}
        onAttachOne={(questionId) => attachMutation.mutate(questionId)}
        onAttachMany={(questionIds) => attachManyMutation.mutate(questionIds)}
        onDetachOne={(questionId) => setDetachTarget(questionId)}
        onDetachMany={(questionIds) => setDetachMany(questionIds)}
        onRetry={() => void bankQuery.refetch()}
      />

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
        <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(buildQuizPatch(form))}>Save as draft</Button>
        {quiz.status === "draft" ? (
          <Button className="min-h-11 rounded-xl bg-brand text-white shadow-[0_8px_20px_rgba(91,127,255,0.3)] hover:bg-brand-hover disabled:opacity-40" disabled={publishMutation.isPending || blockers.length > 0} onClick={() => publishMutation.mutate()}><Sparkles className="size-4" /> Publish quiz</Button>
        ) : (
          <>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-line px-4 text-sm font-semibold text-sub"><Check className="size-4" /> Published — visible to students</span>
            <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={unpublishMutation.isPending} onClick={() => setUnpublishOpen(true)}>
              <Undo2 className="size-4" /> Unpublish
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={unpublishOpen} onOpenChange={setUnpublishOpen}>
        <AlertDialogContent className="border-line bg-panel text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">Unpublish this quiz?</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">
              Students will no longer see or be able to start it. Any attempt already in progress is submitted
              automatically and scores 0 — it still counts as an attempt, so they cannot retake it.
              This can be published again. Once any score is released this becomes permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-canvas text-ink hover:bg-line" disabled={unpublishMutation.isPending}>Keep published</AlertDialogCancel>
            <AlertDialogAction className="bg-ruby text-white hover:bg-ruby-hover" disabled={unpublishMutation.isPending} onClick={(e) => { e.preventDefault(); unpublishMutation.mutate(); }}>
              {unpublishMutation.isPending ? "Unpublishing…" : "Unpublish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
