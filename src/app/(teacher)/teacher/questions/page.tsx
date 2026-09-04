"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
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

interface CourseRow {
  id: number;
  code: string;
  title: string;
}

interface TopicOptionRow {
  id: number;
  title: string;
}

interface SubjectRow {
  id: number;
  name: string;
}

type QuestionType = "fill_in_gap" | "options";
type TrackMode = "course" | "jamb";

const TYPE_LABEL: Record<QuestionType, string> = {
  fill_in_gap: "Fill-in-gap",
  options: "Options",
};

const NONE = "__none__";
const ALL = "__all__";
const PAGE_SIZE = 10;
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedQuestions = { data: QuestionRow[]; meta: PageMeta };

export default function QuestionsPage() {
  const queryClient = useQueryClient();

  const [filterCourse, setFilterCourse] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
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
    queryKey: ["teacher", "questions", filterCourse, filterType, filterStatus, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCourse !== ALL) params.set("courseId", filterCourse);
      if (filterType !== ALL) params.set("type", filterType);
      if (filterStatus !== ALL) params.set("status", filterStatus);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const qs = params.toString();
      const res = await apiFetch<PaginatedQuestions>(
        `/teacher/questions${qs ? `?${qs}` : ""}`,
      );
      return { ...res, data: [...res.data].sort((a, b) => b.id - a.id) };
    },
  });

  // --- Editor state -------------------------------------------------------
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

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", formCourseId],
    queryFn: async () => {
      const res = await apiFetch<{ data: TopicOptionRow[] }>(
        `/teacher/topics?courseId=${encodeURIComponent(formCourseId)}`,
      );
      return [...res.data].sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: editorOpen && track === "course" && formCourseId !== "",
  });

  const runExec = (command: "bold" | "subscript" | "superscript") => {
    bodyRef.current?.focus();
    document.execCommand(command);
  };

  const resetEditor = () => {
    setEditingId(null);
    setFormType("fill_in_gap");
    setBodyText("");
    setBlanks([""]);
    setOptions([
      { text: "", correct: true },
      { text: "", correct: false },
    ]);
    setTrack("course");
    setFormCourseId("");
    setFormTopicId(NONE);
    setFormSubjectId("");
    setFormError(null);
  };

  const openAdd = () => {
    resetEditor();
    if (bodyRef.current) bodyRef.current.innerHTML = "";
    setEditorOpen(true);
  };

  const openEdit = async (q: QuestionRow) => {
    setFormError(null);
    try {
      const detail = await apiFetch<QuestionDetail>(`/teacher/questions/${q.id}`);
      setEditingId(q.id);
      setFormType(q.questionType);
      setBlanks(
        detail.blanks.length > 0 ? detail.blanks.map((b) => b.acceptedAnswer) : [""],
      );
      setOptions(
        detail.options.length > 0
          ? detail.options.map((o) => ({ text: o.optionText, correct: o.isCorrect }))
          : [
              { text: "", correct: true },
              { text: "", correct: false },
            ],
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
      // Seed via the ref callback — a setTimeout(0) can fire before Radix mounts the dialog content.
      pendingBodyRef.current = detail.bodyRichText ?? "";
    } catch (err) {
      setFormError(null);
      setActionError(
        err instanceof ApiError ? err.message : "Could not load the question.",
      );
    }
  };

  const buildBody = (status: "draft" | "published") =>
    JSON.stringify({
      questionType: formType,
      bodyRichText: bodyRef.current?.innerHTML ?? "",
      courseId: track === "course" && formCourseId !== "" ? Number(formCourseId) : null,
      jambSubjectId:
        track === "jamb" && formSubjectId !== "" ? Number(formSubjectId) : null,
      topicId:
        track === "course" && formTopicId !== NONE ? Number(formTopicId) : null,
      status,
      options:
        formType === "options"
          ? options.map((o) => ({ optionText: o.text, isCorrect: o.correct }))
          : [],
      blanks:
        formType === "fill_in_gap"
          ? blanks.map((b) => ({ acceptedAnswer: b }))
          : [],
    });

  const saveMutation = useMutation({
    mutationFn: async (input: { status: "draft" | "published" }) => {
      const body = buildBody(input.status);
      if (editingId === null) {
        return apiFetch<QuestionDetail>("/teacher/questions", {
          method: "POST",
          body,
        });
      }
      return apiFetch<QuestionDetail>(`/teacher/questions/${editingId}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      setEditorOpen(false);
      toast.success(input.status === "published" ? "Question published" : "Question saved as draft");
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save the question.",
      );
      toast.error(err instanceof ApiError ? err.message : "Could not save the question.");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/teacher/questions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "questions"] });
      setDeleteTarget(null);
      toast.success("Question deleted");
    },
    onError: (err: unknown) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the question. Try again.",
      );
      toast.error(err instanceof ApiError ? err.message : "Could not delete the question. Try again.");
    },
  });

  // Publish validity mirrors the strict publish schema live (spec requirement).
  const hasTrack =
    (track === "course" && formCourseId !== "") ||
    (track === "jamb" && formSubjectId !== "");

  const blockers: string[] = [];
  if (!hasTrack) {
    blockers.push("Pick a course or a JAMB subject.");
  }
  if (bodyText.trim() === "") {
    blockers.push("Write the question text.");
  }
  if (formType === "options") {
    if (options.length < 2) blockers.push("Options questions need at least two options.");
    if (options.some((o) => o.text.trim() === ""))
      blockers.push("Every option needs text.");
    if (options.filter((o) => o.correct).length !== 1)
      blockers.push("Mark exactly one option as correct.");
  } else {
    if (blanks.length < 1) blockers.push("Fill-in-gap questions need at least one blank.");
    if (blanks.some((b) => b.trim() === ""))
      blockers.push("Every blank needs an accepted answer.");
  }

  const courses = coursesQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const filtersActive =
    filterCourse !== ALL || filterType !== ALL || filterStatus !== ALL;

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Questions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your question bank — drafts stay private until you publish them.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          New question
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Label htmlFor="filter-course" className="sr-only">Filter by course</Label>
        <Select value={filterCourse} onValueChange={(value) => { setFilterCourse(value); setPage(1); }}>
          <SelectTrigger id="filter-course" aria-label="Filter by course" className="min-h-11 w-full">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.code} — {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor="filter-type" className="sr-only">Filter by type</Label>
        <Select value={filterType} onValueChange={(value) => { setFilterType(value); setPage(1); }}>
          <SelectTrigger id="filter-type" aria-label="Filter by type" className="min-h-11 w-full">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="fill_in_gap">Fill-in-gap</SelectItem>
            <SelectItem value="options">Options</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="filter-status" className="sr-only">Filter by status</Label>
        <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value); setPage(1); }}>
          <SelectTrigger id="filter-status" aria-label="Filter by status" className="min-h-11 w-full">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {coursesQuery.isPending || questionsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading questions">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : coursesQuery.isError || subjectsQuery.isError || questionsQuery.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {questionsQuery.error instanceof ApiError
                ? questionsQuery.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void questionsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : questionsQuery.data.data.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filtersActive
                ? "No questions match these filters."
                : "No questions yet — create your first one."}
            </p>
            {filtersActive && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFilterCourse(ALL);
                  setFilterType(ALL);
                  setFilterStatus(ALL);
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Questions">
              <TableHeader><TableRow><TableHead>Question</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{questionsQuery.data.data.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="max-w-[28rem] truncate text-base font-medium">{(q.bodyRichText.replace(/<[^>]*>/g, "").trim() || "(empty draft)").slice(0, 120)}</TableCell>
                  <TableCell>{TYPE_LABEL[q.questionType]}</TableCell>
                  <TableCell><span className={q.status === "published" ? "rounded-full bg-primary px-2 py-0.5 text-primary-foreground" : "rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground"}>{q.status === "published" ? "Published" : "Draft"}</span></TableCell>
                  <TableCell className="text-right"><span className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="min-h-11" onClick={() => void openEdit(q)}><Pencil aria-hidden="true" />Edit</Button>
                    <Button variant="ghost" size="sm" className="min-h-11 text-destructive hover:text-destructive" onClick={() => { setActionError(null); setDeleteTarget(q); }}><Trash2 aria-hidden="true" />Delete</Button>
                  </span></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {questionsQuery.data && questionsQuery.data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3" aria-label="Questions pagination">
          <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Previous</Button>
          <span className="text-sm text-muted-foreground">Page {questionsQuery.data.meta.page} of {questionsQuery.data.meta.totalPages}</span>
          <Button variant="outline" className="min-h-11" disabled={page >= questionsQuery.data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId === null ? "New question" : "Edit question"}
            </DialogTitle>
            <DialogDescription>
              Drafts have no requirements — you can always save one and finish later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Question type</Label>
              <div className="flex gap-2">
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={formType === t ? "default" : "outline"}
                    className="min-h-11 flex-1"
                    aria-pressed={formType === t}
                    disabled={editingId !== null}
                    onClick={() => setFormType(t)}
                  >
                    {TYPE_LABEL[t]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="question-body">Question text</Label>
              <div
                role="toolbar"
                aria-label="Formatting"
                className="flex gap-1"
              >
                <Button type="button" variant="outline" size="sm" className="font-bold min-h-9" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("bold")} aria-label="Bold">B</Button>
                <Button type="button" variant="outline" size="sm" className="min-h-9" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("subscript")} aria-label="Subscript">
                  X₂
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-9" onMouseDown={(e) => e.preventDefault()} onClick={() => runExec("superscript")} aria-label="Superscript">
                  X²
                </Button>
              </div>
              <div
                ref={(el) => {
                  bodyRef.current = el;
                  if (el && pendingBodyRef.current !== null) {
                    el.innerHTML = pendingBodyRef.current;
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
                className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {formType === "fill_in_gap" ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Accepted answer(s)</legend>
                {blanks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="text"
                      maxLength={255}
                      value={b}
                      onChange={(e) =>
                        setBlanks(blanks.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      placeholder={`Answer ${i + 1}`}
                      aria-label={`Accepted answer ${i + 1}`}
                      className="min-h-11"
                    />
                    {blanks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setBlanks(blanks.filter((_, j) => j !== i))}
                        aria-label={`Remove answer ${i + 1}`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start min-h-9"
                  onClick={() => setBlanks([...blanks, ""])}
                >
                  + Add blank
                </Button>
              </fieldset>
            ) : (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">
                  Options — select the radio next to the correct one
                </legend>
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={o.correct}
                      onChange={() =>
                        setOptions(options.map((v, j) => ({ ...v, correct: j === i })))
                      }
                      aria-label={`Mark option ${i + 1} correct`}
                      className="size-5 shrink-0 accent-primary"
                    />
                    <Input
                      type="text"
                      maxLength={1000}
                      value={o.text}
                      onChange={(e) =>
                        setOptions(
                          options.map((v, j) =>
                            j === i ? { ...v, text: e.target.value } : v,
                          ),
                        )
                      }
                      placeholder={`Option ${i + 1}`}
                      aria-label={`Option ${i + 1}`}
                      className="min-h-11"
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setOptions(options.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove option ${i + 1}`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start min-h-9"
                  onClick={() =>
                    setOptions([...options, { text: "", correct: false }])
                  }
                >
                  + Add option
                </Button>
              </fieldset>
            )}

            <div className="grid gap-2">
              <Label>Belongs to</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={track === "course" ? "default" : "outline"}
                  className="min-h-11 flex-1"
                  aria-pressed={track === "course"}
                  onClick={() => setTrack("course")}
                >
                  Course / Topic
                </Button>
                <Button
                  type="button"
                  variant={track === "jamb" ? "default" : "outline"}
                  className="min-h-11 flex-1"
                  aria-pressed={track === "jamb"}
                  onClick={() => setTrack("jamb")}
                >
                  JAMB subject
                </Button>
              </div>

              {track === "course" ? (
                <>
                  <Select
                    value={formCourseId}
                    onValueChange={(v) => {
                      setFormCourseId(v);
                      setFormTopicId(NONE);
                    }}
                  >
                    <SelectTrigger aria-label="Course" className="min-h-11 w-full">
                      <SelectValue placeholder="Select a course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.code} — {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={formTopicId}
                    onValueChange={setFormTopicId}
                    disabled={formCourseId === ""}
                  >
                    <SelectTrigger aria-label="Topic (optional)" className="min-h-11 w-full">
                      <SelectValue placeholder="Topic (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No topic</SelectItem>
                      {(topicsQuery.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                  <SelectTrigger aria-label="JAMB subject" className="min-h-11 w-full">
                    <SelectValue placeholder="Select a JAMB subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {blockers.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Publishing is blocked until:
                </p>
                <ul role="list" className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {blockers.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate({ status: "draft" })}
              disabled={saveMutation.isPending}
              className="min-h-11 sm:min-h-10"
            >
              {saveMutation.isPending ? "Saving…" : "Save as draft"}
            </Button>
            <Button
              onClick={() => saveMutation.mutate({ status: "published" })}
              disabled={saveMutation.isPending || blockers.length > 0}
              className="min-h-11 sm:min-h-10"
            >
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deletion is blocked if any quiz or recorded
              answer still references this question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">{actionError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
