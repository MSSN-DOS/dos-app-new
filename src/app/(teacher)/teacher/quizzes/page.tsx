"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
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
    queryFn: () =>
      apiFetch<{ data: CourseOption[] }>("/structure/courses").then((r) => r.data ?? []),
  });
  const subjectsQuery = useQuery({
    queryKey: ["jamb", "subjects"],
    queryFn: () =>
      apiFetch<{ data: SubjectOption[] }>("/jamb/subjects").then((r) => r.data ?? []),
  });

  const courses = [...(coursesQuery.data ?? [])].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const subjects = [...(subjectsQuery.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const quizzesQuery = useQuery({
    queryKey: ["teacher", "quizzes", filterType, filterCourse, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== ALL) params.set("type", filterType);
      if (filterCourse !== ALL) params.set("courseId", filterCourse);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const qs = params.toString();
      return apiFetch<PaginatedQuizzes>(
        `/teacher/quizzes${qs ? `?${qs}` : ""}`,
      ).then((r) => ({ ...r, data: r.data ?? [] }));
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", formCourseId],
    queryFn: () =>
      apiFetch<{ data: TopicOption[] }>(
        `/teacher/topics?courseId=${formCourseId}`,
      ).then((r) => r.data ?? []),
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
      apiFetch<QuizRow>("/teacher/quizzes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (quiz) => {
      queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success("Quiz created");
      router.push(`/teacher/quizzes/${quiz.id}`);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    },
  });

  const formReady =
    formTitle.trim().length > 0 &&
    (track === "course"
      ? formCourseId !== ""
      : formSubjectId !== "") &&
    (formQuizType === "topic"
      ? formTopicId !== ""
      : /^\d{4}-\d{2}-\d{2}$/.test(formWeekStart));

  function handleCreate() {
    setFormError("");
    createMutation.mutate({
      title: formTitle.trim(),
      quizType: formQuizType,
      courseId: track === "course" && formCourseId !== "" ? Number(formCourseId) : null,
      jambSubjectId:
        track === "jamb" && formSubjectId !== "" ? Number(formSubjectId) : null,
      topicId:
        formQuizType === "topic" && formTopicId !== NONE && formTopicId !== ""
          ? Number(formTopicId)
          : null,
      weekStart: formQuizType === "course" ? formWeekStart || null : null,
    });
  }

  const quizzes = quizzesQuery.data?.data ?? [];
  const filtersActive = filterType !== ALL || filterCourse !== ALL;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quizzes</h1>
          <p className="text-sm text-muted-foreground">
            Topic quizzes are ad hoc. Course quizzes run weekly and count toward
            CGPA.
          </p>
        </div>
        <Button
          className="min-h-11"
          onClick={() => {
            resetForm();
            setEditorOpen(true);
          }}
        >
          + New quiz
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Select value={filterType} onValueChange={(value) => { setFilterType(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="topic">Topic Quiz</SelectItem>
            <SelectItem value="course">Course Quiz</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={(value) => { setFilterCourse(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Filter by course">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 space-y-3">
        {quizzesQuery.isPending ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : quizzesQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{(quizzesQuery.error as Error).message}</p>
            <Button variant="outline" size="sm" className="mt-2 min-h-9" onClick={() => quizzesQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filtersActive
                ? "No quizzes match these filters."
                : "No quizzes yet — create your first one."}
            </p>
            {filtersActive ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-9"
                onClick={() => {
                  setFilterType(ALL);
                  setFilterCourse(ALL);
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Quizzes">
              <TableHeader><TableRow><TableHead>Quiz</TableHead><TableHead>Type</TableHead><TableHead>Course / Subject</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{quizzes.map((quiz) => (
                <TableRow key={quiz.id}>
                  <TableCell className="max-w-[20rem] truncate font-medium">{quiz.title}</TableCell>
                  <TableCell>{TYPE_LABEL[quiz.quizType]}</TableCell>
                  <TableCell>{quiz.courseCode ?? quiz.subjectName ?? "—"}{quiz.weekStart ? ` · ${quiz.weekStart}` : ""} · {quiz.questionCount} questions</TableCell>
                  <TableCell><span className={quiz.status === "published" ? "rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground" : "rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"}>{quiz.status === "published" ? "Published" : "Draft"}</span></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" className="min-h-11" onClick={() => router.push(`/teacher/quizzes/${quiz.id}`)}><Pencil aria-hidden="true" />Edit</Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {quizzesQuery.data && quizzesQuery.data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3" aria-label="Quizzes pagination">
          <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Previous</Button>
          <span className="text-sm text-muted-foreground">Page {quizzesQuery.data.meta.page} of {quizzesQuery.data.meta.totalPages}</span>
          <Button variant="outline" className="min-h-11" disabled={page >= quizzesQuery.data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New quiz</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="quiz-title" className="mb-1 block text-sm font-medium">
                Title
              </label>
              <Input
                id="quiz-title"
                value={formTitle}
                maxLength={200}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Mass Transfer — Practice"
              />
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium">Quiz type</span>
              <div className="flex gap-2">
                {(["topic", "course"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={formQuizType === t ? "default" : "outline"}
                    className="min-h-11 flex-1"
                    aria-pressed={formQuizType === t}
                    onClick={() => {
                      setFormQuizType(t);
                      setFormTopicId("");
                      setFormWeekStart("");
                    }}
                  >
                    {t === "topic" ? "Topic Quiz" : "Course Quiz"}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium">Belongs to</span>
              <div className="flex gap-2">
                {(["course", "jamb"] as const).map((tr) => (
                  <Button
                    key={tr}
                    type="button"
                    variant={track === tr ? "default" : "outline"}
                    className="min-h-11 flex-1"
                    aria-pressed={track === tr}
                    onClick={() => {
                      setTrack(tr);
                      setFormTopicId("");
                    }}
                  >
                    {tr === "course" ? "Course" : "JAMB subject"}
                  </Button>
                ))}
              </div>
            </div>

            {track === "course" ? (
              <div>
                <span className="mb-1 block text-sm font-medium">Course</span>
                <Select
                  value={formCourseId}
                  onValueChange={(v) => {
                    setFormCourseId(v);
                    setFormTopicId("");
                  }}
                >
                  <SelectTrigger className="w-full min-h-11">
                    <SelectValue placeholder="Pick a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.code} — {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <span className="mb-1 block text-sm font-medium">JAMB subject</span>
                <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                  <SelectTrigger className="w-full min-h-11">
                    <SelectValue placeholder="Pick a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formQuizType === "topic" ? (
              <div>
                <span className="mb-1 block text-sm font-medium">Topic</span>
                <Select
                  value={formTopicId}
                  onValueChange={setFormTopicId}
                  disabled={formCourseId === ""}
                >
                  <SelectTrigger className="w-full min-h-11">
                    <SelectValue
                      placeholder={formCourseId === "" ? "Pick a course first" : "Pick a topic"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(topicsQuery.data ?? []).map((tp) => (
                      <SelectItem key={tp.id} value={String(tp.id)}>
                        {tp.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label htmlFor="quiz-week" className="mb-1 block text-sm font-medium">
                  Week start (Saturday)
                </label>
                <Input
                  id="quiz-week"
                  type="date"
                  value={formWeekStart}
                  onChange={(e) => setFormWeekStart(e.target.value)}
                />
              </div>
            )}

            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={!formReady || createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? "Creating…" : "Create & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
