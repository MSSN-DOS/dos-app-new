"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Beaker,
  Calculator,
  Atom,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  SearchX,
  Library,
  Filter,
  Plus,
  X,
  FilePlus2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { BULK_ROW_LIMIT, parseBulkRows } from "@/lib/questions/bulk-rows";
import { sanitizeRichText } from "@/lib/sanitize";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { BankTypeDialog, BANK_TYPE_LABELS } from "./bank-type-dialog";
import { BankEditorDialog } from "./bank-editor-dialog";
import type { BankQuestionKind } from "@/lib/validation/question-bank";
import { useAuthoringSubjects } from "@/components/teaching/use-authoring-subjects";

// ── types ────────────────────────────────────────────────────────────────────
interface QuestionRow {
  id: number;
  courseId: number | null;
  jambSubjectId: number | null;
  topicId: number | null;
  questionType: "fill_in_gap" | "options" | "essay";
  passageId?: number | null;
  kind?: BankQuestionKind;
  bodyRichText: string;
  status: "draft" | "published";
}
interface QuestionDetail extends QuestionRow {
  options: { id: number; optionText: string; isCorrect: boolean }[];
  blanks: { id: number; blankIndex: number; acceptedAnswer: string }[];
}
interface TopicOptionRow { id: number; title: string }
type QuestionType = "fill_in_gap" | "options";

const TYPE_LABEL: Record<QuestionType, string> = { fill_in_gap: "Fill-in-gap", options: "Options" };
const NONE = "__none__";
const ALL = "__all__";
const PAGE_SIZE = 10;
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedQuestions = { data: QuestionRow[]; meta: PageMeta };

// ── scientific symbol palettes ───────────────────────────────────────────────
const CHEMISTRY_SYMBOLS: { label: string; insert: string; hint: string }[] = [
  { label: "→", insert: "→", hint: "Reaction arrow" },
  { label: "⇌", insert: "⇌", hint: "Equilibrium" },
  { label: "⟶", insert: "⟶", hint: "Long arrow" },
  { label: "°", insert: "°", hint: "Degree" },
  { label: "Δ", insert: "Δ", hint: "Delta / heat" },
  { label: "·", insert: "·", hint: "Dot · hydrate" },
  { label: "₂", insert: "₂", hint: "Subscript 2 — H₂O" },
  { label: "₃", insert: "₃", hint: "Subscript 3" },
  { label: "₄", insert: "₄", hint: "Subscript 4" },
  { label: "⁺", insert: "⁺", hint: "Superscript +" },
  { label: "⁻", insert: "⁻", hint: "Superscript −" },
  { label: "↓", insert: "↓", hint: "Precipitate ↓" },
  { label: "↑", insert: "↑", hint: "Gas ↑" },
  { label: "½", insert: "½", hint: "One half" },
];

const PHYSICS_SYMBOLS: { label: string; insert: string; hint: string }[] = [
  { label: "Ω", insert: "Ω", hint: "Ohm" },
  { label: "μ", insert: "μ", hint: "Micro" },
  { label: "λ", insert: "λ", hint: "Wavelength" },
  { label: "α", insert: "α", hint: "Alpha" },
  { label: "β", insert: "β", hint: "Beta" },
  { label: "γ", insert: "γ", hint: "Gamma" },
  { label: "θ", insert: "θ", hint: "Theta" },
  { label: "Φ", insert: "Φ", hint: "Phi" },
  { label: "π", insert: "π", hint: "Pi" },
  { label: "Σ", insert: "Σ", hint: "Sigma sum" },
  { label: "ε", insert: "ε", hint: "Epsilon" },
  { label: "ρ", insert: "ρ", hint: "Density" },
  { label: "°", insert: "°", hint: "Degree" },
  { label: "×10", insert: "×10", hint: "Scientific ×10" },
];

const MATH_SYMBOLS: { label: string; insert: string; hint: string }[] = [
  { label: "√", insert: "√", hint: "Square root" },
  { label: "∛", insert: "∛", hint: "Cube root" },
  { label: "∑", insert: "∑", hint: "Summation" },
  { label: "∫", insert: "∫", hint: "Integral" },
  { label: "∂", insert: "∂", hint: "Partial" },
  { label: "±", insert: "±", hint: "Plus-minus" },
  { label: "×", insert: "×", hint: "Multiply" },
  { label: "÷", insert: "÷", hint: "Divide" },
  { label: "≠", insert: "≠", hint: "Not equal" },
  { label: "≤", insert: "≤", hint: "≤" },
  { label: "≥", insert: "≥", hint: "≥" },
  { label: "≈", insert: "≈", hint: "Approximately" },
  { label: "∞", insert: "∞", hint: "Infinity" },
  { label: "²", insert: "²", hint: "Squared" },
  { label: "³", insert: "³", hint: "Cubed" },
  { label: "½", insert: "½", hint: "One half" },
  { label: "¼", insert: "¼", hint: "Quarter" },
  { label: "π", insert: "π", hint: "Pi" },
];

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── component ────────────────────────────────────────────────────────────────
// Shared by /teacher/questions and /admin/questions — the API is role-guarded
// admin+teacher, so the same UI serves both shells.
export function QuestionsView() {
  const queryClient = useQueryClient();
  const [filterCourse, setFilterCourse] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [unattachedOnly, setUnattachedOnly] = useState(true);
  const [page, setPage] = useState(1);

  const {
    courses,
    isPending: subjectsLoading,
    isError: subjectsError,
  } = useAuthoringSubjects();
  const questionsQuery = useQuery({
    queryKey: ["teacher", "questions", filterCourse, filterType, filterStatus, unattachedOnly, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCourse !== ALL) params.set("courseId", filterCourse);
      if (filterType !== ALL) params.set("type", filterType);
      if (filterStatus !== ALL) params.set("status", filterStatus);
      if (unattachedOnly) params.set("unattachedOnly", "1");
      params.set("groupPassages", "1");
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const qs = params.toString();
      const res = await apiFetch<PaginatedQuestions>(`/teacher/questions${qs ? `?${qs}` : ""}`);
      return { ...res, data: [...res.data].sort((a, b) => b.id - a.id) };
    },
  });

  // ── bulk create state ───────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkType, setBulkType] = useState<QuestionType>("fill_in_gap");
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkTopicId, setBulkTopicId] = useState(NONE);
  const [bulkStatus, setBulkStatus] = useState<"draft" | "published">("draft");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [bulkSymbolGroup, setBulkSymbolGroup] = useState<"chemistry" | "physics" | "mathematics">("chemistry");

  // The bulk rows format is "text<Tab>answer<Tab>answer…", but the browser's Tab
  // default moves focus to the next input. Insert literal text (a tab, or a
  // science symbol) at the caret instead.
  const insertBulkText = (text: string) => {
    const el = bulkTextareaRef.current;
    if (el === null) {
      setBulkText((prev) => prev + text);
      return;
    }
    const start = el.selectionStart ?? bulkText.length;
    const end = el.selectionEnd ?? bulkText.length;
    const next = `${bulkText.slice(0, start)}${text}${bulkText.slice(end)}`;
    setBulkText(next);
    // The re-render replaces the value, so restore the caret past the insert.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const insertBulkSeparator = () => insertBulkText("\t");

  const bulkTopicsQuery = useQuery({
    queryKey: ["teacher", "bulk-topics", bulkCourseId],
    queryFn: async () => {
      const res = await apiFetch<{ data: TopicOptionRow[] }>(`/teacher/topics?courseId=${encodeURIComponent(bulkCourseId)}`);
      return [...res.data].sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: bulkOpen && bulkCourseId !== "",
  });

  const bulkParsed = useMemo(() => parseBulkRows(bulkText, bulkType), [bulkText, bulkType]);

  const bulkRowsOk = bulkParsed.rows.length > 0 && bulkParsed.rows.every((r) => r.errors.length === 0);
  const bulkCanSubmit = bulkRowsOk && bulkCourseId !== "";

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const items = bulkParsed.rows.map((r) => {
        const common = {
          bodyRichText: sanitizeRichText(
            r.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>"),
          ),
          courseId: Number(bulkCourseId),
          topicId: bulkTopicId !== NONE ? Number(bulkTopicId) : null,
          status: bulkStatus,
        };
        return r.kind === "options"
          ? {
              ...common,
              questionType: "options" as const,
              options: r.options.map((o) => ({ optionText: o.text, isCorrect: o.correct })),
            }
          : {
              ...common,
              questionType: "fill_in_gap" as const,
              blanks: r.answers.map((a) => ({ acceptedAnswer: a })),
            };
      });
      const res = await apiFetch<{ data: QuestionDetail[] }>("/teacher/questions/bulk", {
        method: "POST",
        body: JSON.stringify({ questions: items }),
      });
      return res.data.length;
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      setBulkOpen(false);
      setBulkText("");
      setBulkType("fill_in_gap");
      setBulkCourseId("");
      setBulkTopicId(NONE);
      setBulkError(null);
      toast.success(bulkStatus === "published" ? `Published ${count} questions` : `Saved ${count} questions as drafts`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Could not create the questions.";
      setBulkError(msg);
      toast.error(msg);
    },
  });

  // Question-bank creation and editing use the shared typed document editor.
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [bankPreset, setBankPreset] = useState<BankQuestionKind>("fill_in_gap");
  const openAdd = () => { setEditingId(undefined); setTypePickerOpen(true); };
  const openEdit = (question: QuestionRow) => { setEditingId(question.id); setBankPreset(question.kind ?? (question.passageId ? "passage" : question.questionType)); setEditorOpen(true); };

  const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiFetch<void>(`/teacher/questions/${id}/document`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      setDeleteTarget(null);
      toast.success("Question deleted");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Could not delete the question. Try again.";
      setActionError(msg);
      toast.error(msg);
    },
  });

  const filtersActive = filterCourse !== ALL || filterType !== ALL || filterStatus !== ALL;
  const paginated = questionsQuery.data;
  const isLoading = subjectsLoading || questionsQuery.isPending;
  const isError = subjectsError || questionsQuery.isError;
  const total = paginated?.meta.total ?? 0;
  const publishedCount = paginated?.data.filter((q) => q.status === "published").length ?? 0;
  const draftCount = paginated?.data.filter((q) => q.status === "draft").length ?? 0;

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  type ToolbarKey = "chemistry" | "physics" | "mathematics";
  const toolbarGroups: Record<ToolbarKey, { icon: React.ReactNode; title: string; desc: string; glyphs: typeof CHEMISTRY_SYMBOLS }> = {
    chemistry: { icon: <Beaker className="size-3.5" />, title: "Chemistry", desc: "Arrows · states · ions", glyphs: CHEMISTRY_SYMBOLS },
    physics: { icon: <Atom className="size-3.5" />, title: "Physics", desc: "Constants · units · Greek", glyphs: PHYSICS_SYMBOLS },
    mathematics: { icon: <Calculator className="size-3.5" />, title: "Mathematics", desc: "Operators · fractions · sets", glyphs: MATH_SYMBOLS },
  };

  return (
    <div className="space-y-6">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              <Library className="size-3" /> Question bank
            </p>
            <h1 className="mt-1 text-[28px] font-bold leading-none tracking-tight text-ink sm:text-[32px]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              Questions
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sub">
              Craft with rich science symbols. Drafts stay private until you publish — publishing runs the strict validation.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => { setBulkError(null); setBulkType("fill_in_gap"); setBulkTopicId(NONE); setBulkText(""); setBulkOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-ink hover:bg-line">
              <FilePlus2 className="size-4" /> Bulk add
            </Button>
            <Button onClick={openAdd} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,127,255,0.35)] hover:bg-brand-hover">
              <Plus className="size-4" /> New question
            </Button>
          </div>
        </div>

        {/* stats strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Total", value: total, sub: "in view", accent: "text-ink" },
            { label: "Published", value: publishedCount, sub: "live in quizzes", accent: "text-brand" },
            { label: "Drafts", value: draftCount, sub: "not yet live", accent: "text-gold" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-panel px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>{s.label}</p>
              <p className={`mt-1 text-xl font-bold leading-none ${s.accent}`} style={{ fontFamily: "var(--font-fraunces), serif" }}>{s.value}</p>
              <p className="mt-1 text-[11px] text-faint">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── filters ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <Filter className="size-3.5" /> Filters
          {filtersActive && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">active</span>}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={filterCourse} onValueChange={(v) => { setFilterCourse(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by course" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent className="border-line bg-panel text-ink">
              <SelectItem value={ALL}>All courses</SelectItem>
              {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by type" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent className="border-line bg-panel text-ink">
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="true_false">True or False</SelectItem>
              <SelectItem value="options">Multiple choice</SelectItem>
              <SelectItem value="fill_in_gap">Fill in the gap</SelectItem>
              <SelectItem value="passage">Passage</SelectItem>
              <SelectItem value="essay">Essay</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by status" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="border-line bg-panel text-ink">
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1">
            <Checkbox
              checked={unattachedOnly}
              onCheckedChange={(v) => { setUnattachedOnly(v === true); setPage(1); }}
              aria-label="Hide questions already attached to a quiz"
              className="border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand"
            />
            <span className="text-xs font-medium text-ink">Hide questions already used in a quiz</span>
          </label>
          {filtersActive && (
            <button type="button" onClick={() => { setFilterCourse(ALL); setFilterType(ALL); setFilterStatus(ALL); setPage(1); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-soft">
              <X className="size-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── list ───────────────────────────────────────────────────────── */}
      <div>
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading questions">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[86px] w-full rounded-2xl bg-line" />)}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-ruby/30 bg-ruby/10 p-6 text-center">
            <AlertCircle className="mx-auto size-6 text-ruby" />
            <p className="mt-2 text-sm font-medium text-ink">{questionsQuery.error instanceof ApiError ? questionsQuery.error.message : "Something went wrong"}</p>
            <Button variant="outline" size="sm" className="mt-3 min-h-9 rounded-xl border-line bg-panel text-ink" onClick={() => void questionsQuery.refetch()}>Retry</Button>
          </div>
        ) : paginated!.data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-line bg-canvas">
              <SearchX className="size-6 text-faint" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              {filtersActive ? "No matches" : unattachedOnly ? "Nothing new to reuse" : "No questions yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-sub">
              {filtersActive
                ? "Try widening your filters, or clear them to see the pool."
                : unattachedOnly
                  ? "Every question in view is already attached to a quiz. Turn off “Hide used” to browse them, or add a fresh batch."
                  : "Create your first question — drafts are free-form, publishing enforces completeness."}
            </p>
            {filtersActive ? (
              <Button variant="outline" size="sm" className="mt-4 min-h-9 rounded-xl border-line bg-canvas text-ink" onClick={() => { setFilterCourse(ALL); setFilterType(ALL); setFilterStatus(ALL); setPage(1); }}>Clear filters</Button>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {unattachedOnly && (
                  <Button variant="outline" size="sm" className="min-h-9 rounded-xl border-line bg-canvas text-ink hover:bg-line" onClick={() => setUnattachedOnly(false)}>Show used questions</Button>
                )}
                <Button size="sm" className="min-h-9 rounded-xl bg-brand text-white hover:bg-brand-hover" onClick={openAdd}><Plus className="size-4" /> New question</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* mobile cards */}
            <div className="grid gap-3 lg:hidden">
              {paginated!.data.map((q) => (
                <div key={q.id} className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-brand/30">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[14px] font-medium leading-6 text-ink line-clamp-2">{stripTags(q.bodyRichText) || "(empty draft)"}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${q.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{q.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-sub">{BANK_TYPE_LABELS[q.kind ?? (q.passageId ? "passage" : q.questionType)]}</span>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="sm" className="min-h-9 rounded-xl bg-canvas text-ink hover:bg-line hover:text-white" onClick={() => void openEdit(q)}><Pencil className="size-3.5" />Edit</Button>
                      <Button variant="ghost" size="sm" className="min-h-9 rounded-xl text-ruby hover:bg-ruby/10 hover:text-ruby" onClick={() => { setActionError(null); setDeleteTarget(q); }}><Trash2 className="size-3.5" />Delete</Button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-line bg-panel lg:block">
              <Table aria-label="Questions">
                <TableHeader>
                  <TableRow className="border-line bg-canvas/60 hover:bg-canvas/60">
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Question</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Type</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Status</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated!.data.map((q) => (
                    <TableRow key={q.id} className="border-line hover:bg-canvas/40">
                      <TableCell className="max-w-[34rem] truncate text-[14px] font-medium text-ink">{stripTags(q.bodyRichText) || "(empty draft)"}</TableCell>
                      <TableCell><span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-sub">{BANK_TYPE_LABELS[q.kind ?? (q.passageId ? "passage" : q.questionType)]}</span></TableCell>
                      <TableCell><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${q.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{q.status === "published" ? "Published" : "Draft"}</span></TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" className="min-h-9 rounded-xl hover:bg-line hover:text-white" onClick={() => void openEdit(q)}><Pencil className="size-3.5" />Edit</Button>
                          <Button variant="ghost" size="sm" className="min-h-9 rounded-xl text-ruby hover:bg-ruby/10 hover:text-ruby" onClick={() => { setActionError(null); setDeleteTarget(q); }}><Trash2 className="size-3.5" />Delete</Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {paginated && paginated.meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3" aria-label="Questions pagination">
          <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}><ChevronLeft className="size-4" />Previous</Button>
          <span className="text-xs font-medium text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Page {paginated.meta.page} of {paginated.meta.totalPages} · {paginated.meta.total} total</span>
          <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={page >= paginated.meta.totalPages} onClick={() => setPage((v) => v + 1)}>Next<ChevronRight className="size-4" /></Button>
        </div>
      )}

      <BankTypeDialog open={typePickerOpen} onOpenChange={setTypePickerOpen} onChoose={kind => { setBankPreset(kind); setEditingId(undefined); setEditorOpen(true); }} />
      <BankEditorDialog open={editorOpen} onOpenChange={setEditorOpen} preset={bankPreset} questionId={editingId} onSaved={() => { setEditorOpen(false); void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] }); void queryClient.invalidateQueries({ queryKey: ["bank-document"] }); }} />

      {/* ── bulk add dialog ───────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel text-ink sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-white"><FilePlus2 className="size-4" /></span>
              Bulk add questions
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-sub">
              {bulkType === "options" ? (
                <>Paste rows from a spreadsheet — one question per line. The question text comes first, then press <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">Tab</span> and type each option. Start the correct option with <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">*</span> — exactly one per row.</>
              ) : (
                <>Paste rows from a spreadsheet — one question per line. The question text comes first, then press <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">Tab</span> and type its accepted answer. Add more columns for extra blanks. Mark each blank in the text with <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">[gap]</span>.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Question type</Label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5">
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={bulkType === t}
                    onClick={() => setBulkType(t)}
                    className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${bulkType === t ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"}`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bulk-paste" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Rows — text then answers</Label>
                <button
                  type="button"
                  onClick={() => insertBulkSeparator()}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-sub hover:border-brand/40 hover:text-ink"
                  title="Insert the answer separator at the caret"
                >
                  ⭾ Insert separator
                </button>
              </div>
              <Textarea
                ref={bulkTextareaRef}
                id="bulk-paste"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Tab") return;
                  e.preventDefault();
                  insertBulkText("\t");
                }}
                rows={7}
                spellCheck={false}
                placeholder={bulkType === "options"
                  ? "The SI unit of resistance is\t*Ohm\tAmpere\tVolt\nPlants absorb which gas?\t*Carbon dioxide\tOxygen\tNitrogen"
                  : "Water boils at [gap]°C.\t100\nThe oxidation state of Fe in Fe₂O₃ is [gap].\t+3\nPhotosynthesis releases [gap].\tOxygen"}
                className="min-h-28 w-full rounded-xl border-line bg-canvas px-3 py-3 font-mono text-[13px] leading-6 text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label="Paste rows"
              />
              <p className="text-[11px] text-faint">
                {bulkType === "options"
                  ? "Tabs separate the options — question text first, then one option per column, * marks the correct one. Empty lines are skipped."
                  : "Tabs separate answers from the text and each other — press Tab (or Insert separator) mid-row. Empty lines are skipped."}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Science symbols</Label>
                <div className="flex gap-1.5">
                  {(Object.keys(toolbarGroups) as Array<ToolbarKey>).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={bulkSymbolGroup === k}
                      onClick={() => setBulkSymbolGroup(k)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${bulkSymbolGroup === k ? "border-brand bg-brand text-white" : "border-line bg-panel text-sub hover:border-brand/30 hover:text-ink"}`}
                    >
                      {toolbarGroups[k].title}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-canvas p-2.5">
                {toolbarGroups[bulkSymbolGroup].glyphs.map((g) => (
                  <button
                    key={`${bulkSymbolGroup}-${g.label}-${g.hint}`}
                    type="button"
                    title={`${g.hint} — ${g.label}`}
                    onClick={() => insertBulkText(g.insert)}
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-sm font-medium text-ink hover:border-brand/40 hover:bg-line active:scale-95"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-faint">Tap a symbol to insert it at the caret — inside the question text or any answer/option.</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select value={bulkCourseId} onValueChange={(v) => { setBulkCourseId(v); setBulkTopicId(NONE); }}>
                <SelectTrigger aria-label="Course for the batch" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="Course — required" /></SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkTopicId} onValueChange={setBulkTopicId} disabled={bulkCourseId === ""}>
                <SelectTrigger aria-label="Topic for the batch (optional)" className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="Topic (optional)" /></SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  <SelectItem value={NONE}>No topic</SelectItem>
                  {(bulkTopicsQuery.data ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Save the batch as</Label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5">
                {(["draft", "published"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={bulkStatus === s}
                    onClick={() => setBulkStatus(s)}
                    className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${bulkStatus === s ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"}`}
                  >
                    {s === "draft" ? "Drafts" : "Publish now"}
                  </button>
                ))}
              </div>
              {bulkStatus === "published" && <p className="text-[11px] leading-relaxed text-gold">Publishing runs the strict check — every row must be complete or the whole batch is rejected without saving.</p>}
            </div>

            {bulkParsed.rows.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Preview — {bulkParsed.rows.length} rows</p>
                  {bulkParsed.ignored > 0 && <p className="text-[11px] text-gold">+{bulkParsed.ignored} more lines ignored (max {BULK_ROW_LIMIT})</p>}
                </div>
                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-canvas p-2">
                  {bulkParsed.rows.map((r) => (
                    <div key={r.line} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${r.errors.length > 0 ? "border-ruby/30 bg-ruby/10" : "border-line bg-panel"}`}>
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-line text-[10px] font-bold text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>{r.line}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] leading-5 text-ink">{r.body || "(empty)"}</p>
                        <p className="mt-1 flex flex-wrap gap-1">
                          {r.kind === "options"
                            ? r.options.map((o, i) => (
                                <span
                                  key={i}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] ${o.correct ? "border-brand/40 bg-brand/15 font-semibold text-brand-soft" : "border-line bg-panel text-sub"}`}
                                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                                >
                                  {o.correct ? "✓ " : ""}{i + 1}·{o.text || "(empty)"}
                                </span>
                              ))
                            : r.answers.map((a, i) => (
                                <span key={i} className="rounded-md border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-[11px] text-brand-soft" style={{ fontFamily: "JetBrains Mono, monospace" }}>{i + 1}·{a}</span>
                              ))}
                        </p>
                        {r.errors.length > 0 && (
                          <p className="mt-1 text-[11px] font-medium text-ruby">{r.errors.join(" · ")}</p>
                        )}
                      </div>
                      <span className={`mt-1 shrink-0 text-[10px] font-bold uppercase tracking-wide ${r.errors.length > 0 ? "text-ruby" : "text-brand-soft"}`}>{r.errors.length > 0 ? "Fix" : "Ok"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkError && <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{bulkError}</p>}
          </div>

          <DialogFooter className="gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkMutation.isPending} className="min-h-11 rounded-xl border-line bg-canvas text-ink hover:bg-line sm:min-h-10">Cancel</Button>
            <Button onClick={() => bulkMutation.mutate()} disabled={!bulkCanSubmit || bulkMutation.isPending} className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40 sm:min-h-10">
              {bulkMutation.isPending ? "Creating…" : bulkStatus === "published" ? "Publish batch" : `Create ${bulkParsed.rows.length} drafts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-line bg-panel text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">{deleteTarget?.passageId ? "Delete this passage and its sub-questions?" : "Delete this question?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-sub">This cannot be undone. Deletion is blocked if any quiz or recorded answer still references this question.</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p role="alert" className="rounded-lg border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 border-line bg-canvas text-ink hover:bg-line" disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(e) => { e.preventDefault(); confirmDelete(); }} className="min-h-11 bg-ruby text-white hover:bg-ruby-hover">{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
