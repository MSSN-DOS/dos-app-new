"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Beaker,
  FlaskConical,
  Calculator,
  Atom,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Sparkles,
  SearchX,
  Library,
  Filter,
  Plus,
  X,
  FilePlus2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

// ── types ────────────────────────────────────────────────────────────────────
interface QuestionRow {
  id: number;
  courseId: number | null;
  jambSubjectId: number | null;
  topicId: number | null;
  questionType: "fill_in_gap" | "options";
  bodyRichText: string;
  status: "draft" | "published";
}
interface QuestionDetail extends QuestionRow {
  options: { id: number; optionText: string; isCorrect: boolean }[];
  blanks: { id: number; blankIndex: number; acceptedAnswer: string }[];
}
interface CourseRow { id: number; code: string; title: string }
interface TopicOptionRow { id: number; title: string }
interface SubjectRow { id: number; name: string }

type QuestionType = "fill_in_gap" | "options";
type TrackMode = "course" | "jamb";

const TYPE_LABEL: Record<QuestionType, string> = { fill_in_gap: "Fill-in-gap", options: "Options" };
const NONE = "__none__";
const ALL = "__all__";
const PAGE_SIZE = 10;
const BULK_LIMIT = 50;
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
export default function QuestionsPage() {
  const queryClient = useQueryClient();
  const [filterCourse, setFilterCourse] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [unattachedOnly, setUnattachedOnly] = useState(true);
  const [page, setPage] = useState(1);

  const coursesQuery = useQuery({
    queryKey: ["structure", "courses"],
    queryFn: async () => {
      const res = await apiFetch<{ data: CourseRow[] }>("/structure/courses");
      return [...res.data].sort((a, b) => a.code.localeCompare(b.code));
    },
  });
  const subjectsQuery = useQuery({
    queryKey: ["jamb", "subjects"],
    queryFn: async () => {
      const res = await apiFetch<{ data: SubjectRow[] }>("/jamb/subjects");
      return res.data;
    },
  });
  const questionsQuery = useQuery({
    queryKey: ["teacher", "questions", filterCourse, filterType, filterStatus, unattachedOnly, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCourse !== ALL) params.set("courseId", filterCourse);
      if (filterType !== ALL) params.set("type", filterType);
      if (filterStatus !== ALL) params.set("status", filterStatus);
      if (unattachedOnly) params.set("unattachedOnly", "1");
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
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkTopicId, setBulkTopicId] = useState(NONE);
  const [bulkStatus, setBulkStatus] = useState<"draft" | "published">("draft");
  const [bulkError, setBulkError] = useState<string | null>(null);

  const bulkTopicsQuery = useQuery({
    queryKey: ["teacher", "bulk-topics", bulkCourseId],
    queryFn: async () => {
      const res = await apiFetch<{ data: TopicOptionRow[] }>(`/teacher/topics?courseId=${encodeURIComponent(bulkCourseId)}`);
      return [...res.data].sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: bulkOpen && bulkCourseId !== "",
  });

  const bulkParsed = useMemo(() => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const rows = lines.slice(0, BULK_LIMIT).map((line, idx) => {
      const parts = line.split("\t").map((p) => p.trim());
      const body = parts[0] ?? "";
      const answers = parts.slice(1);
      const errors: string[] = [];
      if (body === "") errors.push("No question text");
      else if (body.length > 20000) errors.push("Question text over 20,000 characters");
      if (answers.length === 0) errors.push('Press Tab, then type the accepted answer');
      answers.forEach((a, i) => {
        if (a === "") errors.push(`Answer ${i + 1} is empty`);
        else if (a.length > 255) errors.push(`Answer ${i + 1} over 255 characters`);
      });
      return { line: idx + 1, body, answers, errors };
    });
    return { rows, ignored: Math.max(0, lines.length - BULK_LIMIT) };
  }, [bulkText]);

  const bulkRowsOk = bulkParsed.rows.length > 0 && bulkParsed.rows.every((r) => r.errors.length === 0);
  const bulkCanSubmit = bulkRowsOk && bulkCourseId !== "";

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const items = bulkParsed.rows.map((r) => ({
        questionType: "fill_in_gap",
        bodyRichText: sanitizeRichText(
          r.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>"),
        ),
        courseId: Number(bulkCourseId),
        topicId: bulkTopicId !== NONE ? Number(bulkTopicId) : null,
        status: bulkStatus,
        blanks: r.answers.map((a) => ({ acceptedAnswer: a })),
      }));
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

  // ── editor state ─────────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState<QuestionType>("fill_in_gap");
  const [bodyRef] = useState(() => ({ current: null as HTMLDivElement | null }));
  const [pendingBodyRef] = useState(() => ({ current: null as string | null }));
  const [bodyText, setBodyText] = useState("");
  const [blanks, setBlanks] = useState<string[]>([""]);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([
    { text: "", correct: true },
    { text: "", correct: false },
  ]);
  const [track, setTrack] = useState<TrackMode>("course");
  const [formCourseId, setFormCourseId] = useState("");
  const [formTopicId, setFormTopicId] = useState(NONE);
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [activeToolbar, setActiveToolbar] = useState<"chemistry" | "physics" | "mathematics">("chemistry");

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", formCourseId],
    queryFn: async () => {
      const res = await apiFetch<{ data: TopicOptionRow[] }>(`/teacher/topics?courseId=${encodeURIComponent(formCourseId)}`);
      return [...res.data].sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: editorOpen && track === "course" && formCourseId !== "",
  });

  const runExec = (command: "bold" | "italic" | "underline" | "subscript" | "superscript" | "insertUnorderedList") => {
    bodyRef.current?.focus();
    document.execCommand(command);
    setBodyText(bodyRef.current?.innerText ?? "");
  };
  const insertSymbol = (text: string) => {
    bodyRef.current?.focus();
    // insertText respects caret; fallback to insertHTML for safety
    const ok = document.execCommand("insertText", false, text);
    if (!ok) document.execCommand("insertHTML", false, text);
    setBodyText(bodyRef.current?.innerText ?? "");
  };

  const resetEditor = () => {
    setEditingId(null);
    setFormType("fill_in_gap");
    setBodyText("");
    setBlanks([""]);
    setOptions([{ text: "", correct: true }, { text: "", correct: false }]);
    setTrack("course");
    setFormCourseId("");
    setFormTopicId(NONE);
    setFormSubjectId("");
    setFormError(null);
    setActiveToolbar("chemistry");
  };
  const openAdd = () => {
    resetEditor();
    if (bodyRef.current) bodyRef.current.innerHTML = "";
    setBodyText("");
    setEditorOpen(true);
  };
  const openEdit = async (q: QuestionRow) => {
    setFormError(null);
    try {
      const detail = await apiFetch<QuestionDetail>(`/teacher/questions/${q.id}`);
      setEditingId(q.id);
      setFormType(q.questionType);
      setBlanks(detail.blanks.length > 0 ? detail.blanks.map((b) => b.acceptedAnswer) : [""]);
      setOptions(
        detail.options.length > 0
          ? detail.options.map((o) => ({ text: o.optionText, correct: o.isCorrect }))
          : [{ text: "", correct: true }, { text: "", correct: false }],
      );
      if (detail.jambSubjectId !== null) {
        setTrack("jamb");
        setFormSubjectId(String(detail.jambSubjectId));
        setFormCourseId("");
        setFormTopicId(NONE);
      } else {
        setTrack("course");
        setFormCourseId(detail.courseId !== null ? String(detail.courseId) : "");
        setFormTopicId(detail.topicId !== null ? String(detail.topicId) : NONE);
        setFormSubjectId("");
      }
      setEditorOpen(true);
      pendingBodyRef.current = detail.bodyRichText ?? "";
    } catch (err) {
      setFormError(null);
      setActionError(err instanceof ApiError ? err.message : "Could not load the question.");
    }
  };

  const buildBody = (status: "draft" | "published") =>
    JSON.stringify({
      questionType: formType,
      bodyRichText: sanitizeRichText(bodyRef.current?.innerHTML ?? ""),
      courseId: track === "course" && formCourseId !== "" ? Number(formCourseId) : null,
      jambSubjectId: track === "jamb" && formSubjectId !== "" ? Number(formSubjectId) : null,
      topicId: track === "course" && formTopicId !== NONE ? Number(formTopicId) : null,
      status,
      options: formType === "options" ? options.map((o) => ({ optionText: o.text, isCorrect: o.correct })) : [],
      blanks: formType === "fill_in_gap" ? blanks.map((b) => ({ acceptedAnswer: b })) : [],
    });

  const saveMutation = useMutation({
    mutationFn: async (input: { status: "draft" | "published" }) => {
      const body = buildBody(input.status);
      if (editingId === null) return apiFetch<QuestionDetail>("/teacher/questions", { method: "POST", body });
      return apiFetch<QuestionDetail>(`/teacher/questions/${editingId}`, { method: "PATCH", body });
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      setEditorOpen(false);
      toast.success(input.status === "published" ? "Question published" : "Question saved as draft");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Could not save the question.";
      setFormError(msg);
      toast.error(msg);
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiFetch<void>(`/teacher/questions/${id}`, { method: "DELETE" }),
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

  const hasTrack = (track === "course" && formCourseId !== "") || (track === "jamb" && formSubjectId !== "");
  const blockers: string[] = [];
  if (!hasTrack) blockers.push("Pick a course or a JAMB subject.");
  if (bodyText.trim() === "") blockers.push("Write the question text.");
  if (formType === "options") {
    if (options.length < 2) blockers.push("Options questions need at least two options.");
    if (options.some((o) => o.text.trim() === "")) blockers.push("Every option needs text.");
    if (options.filter((o) => o.correct).length !== 1) blockers.push("Mark exactly one option as correct.");
  } else {
    if (blanks.length < 1) blockers.push("Fill-in-gap needs at least one blank.");
    if (blanks.some((b) => b.trim() === "")) blockers.push("Every blank needs an accepted answer.");
  }

  const courses = coursesQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const filtersActive = filterCourse !== ALL || filterType !== ALL || filterStatus !== ALL;
  const paginated = questionsQuery.data;
  const isLoading = coursesQuery.isPending || questionsQuery.isPending;
  const isError = coursesQuery.isError || subjectsQuery.isError || questionsQuery.isError;
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
            <Button onClick={() => { setBulkError(null); setBulkTopicId(NONE); setBulkText(""); setBulkOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-ink hover:bg-line">
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
              <SelectItem value="fill_in_gap">Fill-in-gap</SelectItem>
              <SelectItem value="options">Options</SelectItem>
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
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-sub">{TYPE_LABEL[q.questionType]}</span>
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
                      <TableCell><span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-sub">{TYPE_LABEL[q.questionType]}</span></TableCell>
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

      {/* ── editor dialog ─────────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel text-ink sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-white"><Sparkles className="size-4" /></span>
              {editingId === null ? "New question" : "Edit question"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-sub">Drafts have no requirements — save anytime. Publishing enforces completeness. Use the science toolbars to insert symbols at the caret.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            {/* type toggle */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Question type</Label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5">
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={formType === t}
                    disabled={editingId !== null}
                    onClick={() => setFormType(t)}
                    className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${formType === t ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"} disabled:opacity-50`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* rich text + toolbar */}
            <div className="grid gap-2">
              <Label htmlFor="question-body" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Question text</Label>

              {/* toolbar */}
              <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
                {/* format row */}
                <div className="flex flex-wrap items-center gap-1 border-b border-line bg-sunk px-2 py-2">
                  <span className="mr-1 hidden text-[10px] font-bold uppercase tracking-[0.12em] text-faint sm:inline" style={{ fontFamily: "JetBrains Mono, monospace" }}>Format</span>
                  <div className="flex gap-1">
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("bold")} aria-label="Bold" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-sm font-bold text-ink hover:border-brand/40 hover:bg-line">B</button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("italic")} aria-label="Italic" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-sm italic text-ink hover:border-brand/40 hover:bg-line">I</button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("underline")} aria-label="Underline" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-sm underline text-ink hover:border-brand/40 hover:bg-line">U</button>
                    <span className="mx-1 h-8 w-px bg-line" />
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("subscript")} aria-label="Subscript" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-xs font-semibold text-ink hover:border-brand/40 hover:bg-line">X₂</button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("superscript")} aria-label="Superscript" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-xs font-semibold text-ink hover:border-brand/40 hover:bg-line">X²</button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("insertUnorderedList")} aria-label="Bullet list" className="hidden size-8 items-center justify-center rounded-lg border border-line bg-panel text-xs text-ink hover:border-brand/40 hover:bg-line sm:inline-flex">• ≡</button>
                  </div>
                </div>

                {/* grouped science toolbars */}
                <div className="space-y-3 p-3">
                  {/* group tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {(Object.keys(toolbarGroups) as Array<ToolbarKey>).map((k) => {
                      const active = activeToolbar === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setActiveToolbar(k)}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-brand bg-brand text-white" : "border-line bg-panel text-sub hover:border-brand/30 hover:text-ink"}`}
                        >
                          {toolbarGroups[k].icon}
                          {toolbarGroups[k].title}
                          <span className={`hidden text-[10px] font-normal sm:inline ${active ? "text-white/70" : "text-faint"}`}>· {toolbarGroups[k].desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* active group palette */}
                  <div className="rounded-xl border border-line bg-panel/70 p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gold" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {toolbarGroups[activeToolbar].icon}
                        {toolbarGroups[activeToolbar].title}
                      </span>
                      <span className="text-[11px] text-faint">{toolbarGroups[activeToolbar].desc} — tap to insert at caret</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {toolbarGroups[activeToolbar].glyphs.map((g) => (
                        <button
                          key={`${activeToolbar}-${g.label}-${g.hint}`}
                          type="button"
                          title={`${g.hint} — ${g.label}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertSymbol(g.insert)}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-line bg-canvas px-2.5 py-1 font-mono text-sm font-medium text-ink hover:border-brand/40 hover:bg-line hover:text-white active:scale-95"
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* quick access: other two groups as compact rows */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(toolbarGroups) as Array<ToolbarKey>)
                      .filter((k) => k !== activeToolbar)
                      .map((k) => (
                        <div key={`compact-${k}`} className="rounded-xl border border-dashed border-line bg-canvas/50 px-2.5 py-2">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                              {toolbarGroups[k].icon} {toolbarGroups[k].title}
                            </span>
                            <button type="button" onClick={() => setActiveToolbar(k)} className="text-[10px] font-semibold text-brand hover:text-brand-soft">Open →</button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {toolbarGroups[k].glyphs.slice(0, 6).map((g) => (
                              <button key={`mini-${k}-${g.label}`} type="button" title={g.hint} onMouseDown={(e) => e.preventDefault()} onClick={() => insertSymbol(g.insert)} className="inline-flex size-7 items-center justify-center rounded-md border border-line bg-panel font-mono text-xs text-sub hover:border-brand/30 hover:text-ink">{g.label}</button>
                            ))}
                            <span className="inline-flex size-7 items-center justify-center text-[10px] text-faint">+{toolbarGroups[k].glyphs.length - 6}</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-faint">
                    <FlaskConical className="size-3 shrink-0" />
                    Tip: highlight text then hit <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">X₂</span> / <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">X²</span> for sub/superscript — e.g. H<span className="text-[10px]">2</span>O, CO<span className="text-[10px]">3</span><sup className="text-[10px]">2−</sup>, x<span className="text-[10px]">2</span>.
                  </p>
                </div>
              </div>

              <div
                ref={(el) => {
                  bodyRef.current = el;
                  if (el && pendingBodyRef.current !== null) {
                    el.innerHTML = sanitizeRichText(pendingBodyRef.current);
                    setBodyText(el.innerText);
                    pendingBodyRef.current = null;
                  }
                }}
                id="question-body"
                role="textbox"
                aria-multiline="true"
                aria-label="Question text"
                contentEditable
                suppressContentEditableWarning
                onInput={() => setBodyText(bodyRef.current?.innerText ?? "")}
                data-placeholder="Write the stem… e.g. Balance: Fe + O₂ → Fe₂O₃"
                className="min-h-[108px] w-full rounded-xl border border-line bg-canvas px-3 py-3 text-[15px] leading-6 text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand empty:before:text-faint empty:before:content-[attr(data-placeholder)]"
              />
              <p className="text-[11px] text-faint">{bodyText.length} characters · rich text (bold, sub/sup, lists) is preserved. Paste from Word/Google Docs is sanitized.</p>
            </div>

            {formType === "fill_in_gap" ? (
              <fieldset className="grid gap-2 rounded-2xl border border-line bg-canvas p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-[0.1em] text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Accepted answer(s) — one per blank</legend>
                {blanks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-line text-xs font-bold text-sub">{i + 1}</span>
                    <Input type="text" maxLength={255} value={b} onChange={(e) => setBlanks(blanks.map((v, j) => (j === i ? e.target.value : v)))} placeholder={`Answer ${i + 1} — e.g. ${i === 0 ? "H₂O" : "photosynthesis"}`} aria-label={`Accepted answer ${i + 1}`} className="min-h-11 rounded-xl border-line bg-panel text-ink placeholder:text-faint" />
                    {blanks.length > 1 && <Button type="button" variant="ghost" size="sm" className="shrink-0 rounded-xl text-sub hover:bg-line hover:text-ink" onClick={() => setBlanks(blanks.filter((_, j) => j !== i))} aria-label={`Remove answer ${i + 1}`}><X className="size-4" /></Button>}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="justify-self-start mt-1 min-h-9 rounded-xl border-line bg-panel text-ink hover:bg-line" onClick={() => setBlanks([...blanks, ""])}>+ Add blank</Button>
              </fieldset>
            ) : (
              <fieldset className="grid gap-2 rounded-2xl border border-line bg-canvas p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-[0.1em] text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Options — radio marks the single correct one</legend>
                {options.map((o, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${o.correct ? "border-brand/40 bg-brand/10" : "border-line bg-panel"}`}>
                    <input type="radio" name="correct-option" checked={o.correct} onChange={() => setOptions(options.map((v, j) => ({ ...v, correct: j === i })))} aria-label={`Mark option ${i + 1} correct`} className="size-5 shrink-0 accent-brand" />
                    <Input type="text" maxLength={1000} value={o.text} onChange={(e) => setOptions(options.map((v, j) => (j === i ? { ...v, text: e.target.value } : v)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className="min-h-11 flex-1 rounded-xl border-line bg-canvas text-ink placeholder:text-faint" />
                    {options.length > 2 && <Button type="button" variant="ghost" size="sm" className="shrink-0 rounded-xl text-sub hover:bg-line hover:text-ink" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}><X className="size-4" /></Button>}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="justify-self-start mt-1 min-h-9 rounded-xl border-line bg-panel text-ink hover:bg-line" onClick={() => setOptions([...options, { text: "", correct: false }])}>+ Add option</Button>
              </fieldset>
            )}

            <div className="grid gap-3 rounded-2xl border border-line bg-canvas p-4">
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Belongs to</Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-panel p-1">
                <button type="button" onClick={() => setTrack("course")} aria-pressed={track === "course"} className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${track === "course" ? "bg-brand text-white" : "text-sub hover:text-ink"}`}>Course / Topic</button>
                <button type="button" onClick={() => setTrack("jamb")} aria-pressed={track === "jamb"} className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${track === "jamb" ? "bg-brand text-white" : "text-sub hover:text-ink"}`}>JAMB subject</button>
              </div>
              {track === "course" ? (
                <div className="grid gap-2">
                  <Select value={formCourseId} onValueChange={(v) => { setFormCourseId(v); setFormTopicId(NONE); }}>
                    <SelectTrigger aria-label="Course" className="min-h-11 w-full rounded-xl border-line bg-panel text-ink"><SelectValue placeholder="Select a course" /></SelectTrigger>
                    <SelectContent className="border-line bg-panel text-ink">
                      {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={formTopicId} onValueChange={setFormTopicId} disabled={formCourseId === ""}>
                    <SelectTrigger aria-label="Topic (optional)" className="min-h-11 w-full rounded-xl border-line bg-panel text-ink"><SelectValue placeholder="Topic (optional)" /></SelectTrigger>
                    <SelectContent className="border-line bg-panel text-ink">
                      <SelectItem value={NONE}>No topic</SelectItem>
                      {(topicsQuery.data ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                  <SelectTrigger aria-label="JAMB subject" className="min-h-11 w-full rounded-xl border-line bg-panel text-ink"><SelectValue placeholder="Select a JAMB subject" /></SelectTrigger>
                  <SelectContent className="border-line bg-panel text-ink">
                    {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {blockers.length > 0 && (
              <div className="rounded-xl border border-gold/30 bg-gold/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-gold"><AlertCircle className="size-3.5" /> Publishing is blocked until:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-gold/90">
                  {blockers.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            {formError && <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{formError}</p>}
          </div>

          <DialogFooter className="gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => saveMutation.mutate({ status: "draft" })} disabled={saveMutation.isPending} className="min-h-11 rounded-xl border-line bg-canvas text-ink hover:bg-line sm:min-h-10">{saveMutation.isPending ? "Saving…" : "Save as draft"}</Button>
            <Button onClick={() => saveMutation.mutate({ status: "published" })} disabled={saveMutation.isPending || blockers.length > 0} className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40 sm:min-h-10"><Sparkles className="size-4" /> Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── bulk add dialog ───────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel text-ink sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-white"><FilePlus2 className="size-4" /></span>
              Bulk add questions
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-sub">
              Paste rows from a spreadsheet — one question per line. The question text comes first, then press <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">Tab</span> and type its accepted answer. Add more columns for extra blanks. Mark each blank in the text with <span className="rounded bg-line px-1 py-0.5 font-mono text-ink">[gap]</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-paste" className="text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Rows — text then answers</Label>
              <Textarea
                id="bulk-paste"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={"Water boils at [gap]°C.\t100\nThe oxidation state of Fe in Fe₂O₃ is [gap].\t+3\nPhotosynthesis releases [gap].\tOxygen"}
                className="min-h-28 w-full rounded-xl border-line bg-canvas px-3 py-3 font-mono text-[13px] leading-6 text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label="Paste rows"
              />
              <p className="text-[11px] text-faint">Tabs separate answers from the text and each other. Empty lines are skipped.</p>
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
                  {bulkParsed.ignored > 0 && <p className="text-[11px] text-gold">+{bulkParsed.ignored} more lines ignored (max {BULK_LIMIT})</p>}
                </div>
                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-canvas p-2">
                  {bulkParsed.rows.map((r) => (
                    <div key={r.line} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${r.errors.length > 0 ? "border-ruby/30 bg-ruby/10" : "border-line bg-panel"}`}>
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-line text-[10px] font-bold text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>{r.line}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] leading-5 text-ink">{r.body || "(empty)"}</p>
                        <p className="mt-1 flex flex-wrap gap-1">
                          {r.answers.map((a, i) => (
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
            <AlertDialogTitle className="text-ink">Delete this question?</AlertDialogTitle>
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
