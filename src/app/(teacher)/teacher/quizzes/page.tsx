"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, SearchX, Layers, GraduationCap, Plus, Filter, Calendar, Clock3, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type QuizRow = {
  id: number;
  title: string;
  quizType: "topic" | "course";
  courseId: number | null;
  jambSubjectId: number | null;
  topicId: number | null;
  weekStart: string | null;
  questionCount: number;
  status: "draft" | "published";
  courseCode: string | null;
  subjectName: string | null;
};

type CourseOption = { id: number; code: string; title: string };
type SubjectOption = { id: number; name: string };
type TopicOption = { id: number; title: string; courseId: number };

const ALL = "__all__";
const NONE = "__none__";
const PAGE_SIZE = 10;
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedQuizzes = { data: QuizRow[]; meta: PageMeta };

const TYPE_LABEL: Record<QuizRow["quizType"], string> = {
  topic: "Topic Quiz",
  course: "Course Quiz",
};

export default function TeacherQuizzesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filterType, setFilterType] = useState<string>(ALL);
  const [filterCourse, setFilterCourse] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const [editorOpen, setEditorOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formQuizType, setFormQuizType] = useState<"topic" | "course">("topic");
  const [track, setTrack] = useState<"course" | "jamb">("course");
  const [formCourseId, setFormCourseId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formTopicId, setFormTopicId] = useState("");
  const [formWeekStart, setFormWeekStart] = useState("");
  const [formError, setFormError] = useState("");

  const coursesQuery = useQuery({
    queryKey: ["structure", "courses"],
    queryFn: () => apiFetch<{ data: CourseOption[] }>("/structure/courses").then((r) => r.data ?? []),
  });
  const subjectsQuery = useQuery({
    queryKey: ["jamb", "subjects"],
    queryFn: () => apiFetch<{ data: SubjectOption[] }>("/jamb/subjects").then((r) => r.data ?? []),
  });

  const courses = [...(coursesQuery.data ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const subjects = [...(subjectsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const quizzesQuery = useQuery({
    queryKey: ["teacher", "quizzes", filterType, filterCourse, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== ALL) params.set("type", filterType);
      if (filterCourse !== ALL) params.set("courseId", filterCourse);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const qs = params.toString();
      return apiFetch<PaginatedQuizzes>(`/teacher/quizzes${qs ? `?${qs}` : ""}`).then((r) => ({ ...r, data: r.data ?? [] }));
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", formCourseId],
    queryFn: () => apiFetch<{ data: TopicOption[] }>(`/teacher/topics?courseId=${formCourseId}`).then((r) => r.data ?? []),
    enabled: editorOpen && formQuizType === "topic" && formCourseId !== "",
  });

  function resetForm() {
    setFormTitle("");
    setFormQuizType("topic");
    setTrack("course");
    setFormCourseId("");
    setFormSubjectId("");
    setFormTopicId("");
    setFormWeekStart("");
    setFormError("");
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<QuizRow>("/teacher/quizzes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (quiz) => {
      queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success("Quiz created — opening builder");
      router.push(`/teacher/quizzes/${quiz.id}`);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setFormError(msg);
      toast.error(msg);
    },
  });

  const formReady =
    formTitle.trim().length > 0 &&
    (track === "course" ? formCourseId !== "" : formSubjectId !== "") &&
    (formQuizType === "topic" ? formTopicId !== "" : /^\d{4}-\d{2}-\d{2}$/.test(formWeekStart));

  function handleCreate() {
    setFormError("");
    createMutation.mutate({
      title: formTitle.trim(),
      quizType: formQuizType,
      courseId: track === "course" && formCourseId !== "" ? Number(formCourseId) : null,
      jambSubjectId: track === "jamb" && formSubjectId !== "" ? Number(formSubjectId) : null,
      topicId: formQuizType === "topic" && formTopicId !== NONE && formTopicId !== "" ? Number(formTopicId) : null,
      weekStart: formQuizType === "course" ? formWeekStart || null : null,
    });
  }

  const quizzes = quizzesQuery.data?.data ?? [];
  const filtersActive = filterType !== ALL || filterCourse !== ALL;
  const total = quizzesQuery.data?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              <Layers className="size-3" /> Quizzes
            </p>
            <h1 className="mt-1 text-[28px] font-bold leading-none tracking-tight text-ink sm:text-[32px]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              Quizzes
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sub">
              Topic quizzes are ad-hoc. Course quizzes run weekly (Sat–Sun) and feed CGPA / Post-UTME. Drafts unlock the builder — publish when the bank is attached.
            </p>
          </div>
          <Button
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,127,255,0.35)] hover:bg-brand-hover"
            onClick={() => {
              resetForm();
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" /> New quiz
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Total", value: total, sub: "quizzes", accent: "text-ink" },
            { label: "Topic", value: quizzes.filter((q) => q.quizType === "topic").length, sub: "in view", accent: "text-gold" },
            { label: "Course", value: quizzes.filter((q) => q.quizType === "course").length, sub: "in view", accent: "text-brand" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-panel px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>{s.label}</p>
              <p className={`mt-1 text-xl font-bold leading-none ${s.accent}`} style={{ fontFamily: "var(--font-fraunces), serif" }}>{s.value}</p>
              <p className="mt-1 text-[11px] text-faint">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* filters */}
      <div className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <Filter className="size-3.5" /> Filters
          {filtersActive && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">active</span>}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className="w-full rounded-xl border-line bg-canvas text-ink sm:w-44" aria-label="Filter by type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent className="border-line bg-panel text-ink">
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="topic">Topic Quiz</SelectItem>
              <SelectItem value="course">Course Quiz</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCourse} onValueChange={(v) => { setFilterCourse(v); setPage(1); }}>
            <SelectTrigger className="w-full rounded-xl border-line bg-canvas text-ink sm:w-56" aria-label="Filter by course">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent className="border-line bg-panel text-ink">
              <SelectItem value={ALL}>All courses</SelectItem>
              {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && (
            <button type="button" onClick={() => { setFilterType(ALL); setFilterCourse(ALL); setPage(1); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-3 text-xs font-semibold text-sub hover:text-ink sm:min-h-11">
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* list */}
      <div className="space-y-3">
        {quizzesQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-[88px] w-full rounded-2xl bg-line" />
            <Skeleton className="h-[88px] w-full rounded-2xl bg-line" />
            <Skeleton className="h-[88px] w-full rounded-2xl bg-line" />
          </div>
        ) : quizzesQuery.isError ? (
          <div className="rounded-2xl border border-ruby/30 bg-ruby/10 p-6 text-center">
            <p className="text-sm font-medium text-ink">{(quizzesQuery.error as Error).message}</p>
            <Button variant="outline" size="sm" className="mt-3 min-h-9 rounded-xl border-line bg-panel text-ink" onClick={() => quizzesQuery.refetch()}>Try again</Button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-line bg-canvas">
              <SearchX className="size-6 text-faint" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>{filtersActive ? "No matches" : "No quizzes yet"}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-sub">{filtersActive ? "Try a different filter — or clear them to see everything." : "Create your first quiz — pick Topic or Course, choose the course/subject, and continue to the builder to attach questions."}</p>
            {filtersActive ? (
              <Button variant="outline" size="sm" className="mt-4 rounded-xl border-line bg-canvas text-ink" onClick={() => { setFilterType(ALL); setFilterCourse(ALL); setPage(1); }}>Clear filters</Button>
            ) : (
              <Button size="sm" className="mt-4 rounded-xl bg-brand text-white hover:bg-brand-hover" onClick={() => { resetForm(); setEditorOpen(true); }}><Plus className="size-4" /> New quiz</Button>
            )}
          </div>
        ) : (
          <>
            {/* mobile cards */}
            <div className="grid gap-3 lg:hidden">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 hover:border-brand/30">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/25 to-transparent opacity-0 group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold leading-5 text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>{quiz.title}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-sub">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${quiz.quizType === "course" ? "border-brand/30 bg-brand/15 text-brand-soft" : "border-gold/30 bg-gold/15 text-gold"}`}>
                          {quiz.quizType === "course" ? <GraduationCap className="size-3" /> : <Layers className="size-3" />}
                          {TYPE_LABEL[quiz.quizType]}
                        </span>
                        <span className="text-faint">·</span>
                        <span className="truncate">{quiz.courseCode ?? quiz.subjectName ?? "—"}</span>
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${quiz.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{quiz.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    <span className="inline-flex items-center gap-1.5"><Calendar className="size-3" />{quiz.weekStart ? quiz.weekStart : "No week"} · {quiz.questionCount} Qs</span>
                    <Button variant="ghost" size="sm" className="min-h-9 rounded-xl bg-canvas text-ink hover:bg-line hover:text-white" onClick={() => router.push(`/teacher/quizzes/${quiz.id}`)}><Pencil className="size-3.5" />Open builder</Button>
                  </div>
                </div>
              ))}
            </div>
            {/* desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-line bg-panel lg:block">
              <Table aria-label="Quizzes">
                <TableHeader>
                  <TableRow className="border-line bg-canvas/60 hover:bg-canvas/60">
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Quiz</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Type</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Course / Subject</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Status</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quizzes.map((quiz) => (
                    <TableRow key={quiz.id} className="border-line hover:bg-canvas/40">
                      <TableCell className="max-w-[22rem] truncate font-medium text-ink">{quiz.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${quiz.quizType === "course" ? "border-brand/30 bg-brand/12 text-brand-soft" : "border-gold/30 bg-gold/12 text-gold"}`}>{TYPE_LABEL[quiz.quizType]}</span>
                      </TableCell>
                      <TableCell className="text-sm text-sub">{quiz.courseCode ?? quiz.subjectName ?? "—"}<span className="text-faint">{quiz.weekStart ? ` · ${quiz.weekStart}` : ""} · {quiz.questionCount} Qs</span></TableCell>
                      <TableCell><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${quiz.status === "published" ? "bg-brand text-white" : "border border-line bg-canvas text-sub"}`}>{quiz.status === "published" ? "Published" : "Draft"}</span></TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" className="min-h-9 rounded-xl hover:bg-line hover:text-white" onClick={() => router.push(`/teacher/quizzes/${quiz.id}`)}><Pencil className="size-3.5" />Edit</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {quizzesQuery.data && quizzesQuery.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3" aria-label="Quizzes pagination">
          <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}><ChevronLeft className="size-4" />Previous</Button>
          <span className="text-xs font-medium text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Page {quizzesQuery.data.meta.page} of {quizzesQuery.data.meta.totalPages}</span>
          <Button variant="outline" className="min-h-11 rounded-xl border-line bg-panel text-ink hover:bg-line" disabled={page >= quizzesQuery.data.meta.totalPages} onClick={() => setPage((v) => v + 1)}>Next<ChevronRight className="size-4" /></Button>
        </div>
      )}

      {/* new quiz dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel text-ink sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>New quiz</DialogTitle>
            <p className="text-xs leading-relaxed text-sub">Pick the type and scope — you&apos;ll attach questions and set timing on the next screen.</p>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="quiz-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Title</label>
              <Input id="quiz-title" value={formTitle} maxLength={200} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Mass Transfer — Practice" className="min-h-11 rounded-xl border-line bg-canvas text-ink placeholder:text-faint" />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Quiz type</span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5">
                {(["topic", "course"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={formQuizType === t} onClick={() => { setFormQuizType(t); setFormTopicId(""); setFormWeekStart(""); }} className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${formQuizType === t ? "bg-brand text-white" : "text-sub hover:text-ink"}`}>{t === "topic" ? "Topic Quiz" : "Course Quiz"}</button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Belongs to</span>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-canvas p-1.5">
                {(["course", "jamb"] as const).map((tr) => (
                  <button key={tr} type="button" aria-pressed={track === tr} onClick={() => { setTrack(tr); setFormTopicId(""); }} className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${track === tr ? "bg-brand text-white" : "text-sub hover:text-ink"}`}>{tr === "course" ? "Course" : "JAMB subject"}</button>
                ))}
              </div>
            </div>

            {track === "course" ? (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Course</span>
                <Select value={formCourseId} onValueChange={(v) => { setFormCourseId(v); setFormTopicId(""); }}>
                  <SelectTrigger className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="Pick a course" /></SelectTrigger>
                  <SelectContent className="border-line bg-panel text-ink">{courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>JAMB subject</span>
                <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                  <SelectTrigger className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder="Pick a subject" /></SelectTrigger>
                  <SelectContent className="border-line bg-panel text-ink">{subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {formQuizType === "topic" ? (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Topic</span>
                <Select value={formTopicId} onValueChange={setFormTopicId} disabled={formCourseId === ""}>
                  <SelectTrigger className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"><SelectValue placeholder={formCourseId === "" ? "Pick a course first" : "Pick a topic"} /></SelectTrigger>
                  <SelectContent className="border-line bg-panel text-ink">{(topicsQuery.data ?? []).map((tp) => <SelectItem key={tp.id} value={String(tp.id)}>{tp.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label htmlFor="quiz-week" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub" style={{ fontFamily: "JetBrains Mono, monospace" }}>Week start (Saturday)</label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input id="quiz-week" type="date" value={formWeekStart} onChange={(e) => setFormWeekStart(e.target.value)} className="min-h-11 rounded-xl border-line bg-canvas pl-9 text-ink" />
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint"><Clock3 className="size-3" /> Must be a Saturday — server enforces the window.</p>
              </div>
            )}

            {formError ? <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby">{formError}</p> : null}
          </div>

          <DialogFooter>
            <Button className="min-h-11 w-full rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40 sm:w-auto" disabled={!formReady || createMutation.isPending} onClick={handleCreate}>{createMutation.isPending ? "Creating…" : "Create & continue →"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
