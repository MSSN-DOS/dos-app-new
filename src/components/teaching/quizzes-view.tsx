"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, SearchX, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quizCreateSchema, quizListFiltersSchema } from "@/lib/validation/quizzes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
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
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";
import { useAuthoringSubjects } from "@/components/teaching/use-authoring-subjects";

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

type TopicOption = { id: number; title: string; courseId: number };

const ALL = "__all__";

const PAGE_SIZE = 10;
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedQuizzes = { data: QuizRow[]; meta: PageMeta };

const TYPE_LABEL: Record<QuizRow["quizType"], string> = {
  topic: "Topic Quiz",
  course: "Course Quiz",
};

// Shared by /teacher/quizzes and /admin/quizzes — the API is role-guarded
// admin+teacher, so the same UI serves both shells. `basePath` is the page
// route prefix (without trailing slash) used for builder navigation.
export function QuizzesView({ basePath }: { basePath: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filterMode, setFilterMode] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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

  const {
    courses,
    jambSubjects: subjects,
    isPending: subjectsPending,
    isError: subjectsError,
    refetch: refetchSubjects,
  } = useAuthoringSubjects();

  const quizzesQuery = useQuery({
    queryKey: ["teacher", "quizzes", filterMode, filterCourse, deferredSearch, page],
    queryFn: () => {
      const filters = quizListFiltersSchema.parse({
        search: deferredSearch,
        type: filterMode === "topic" || filterMode === "course" ? filterMode : undefined,
        status: filterMode === "draft" ? "draft" : undefined,
        courseId: filterCourse !== ALL ? filterCourse : undefined,
      });
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      if (filters.status) params.set("status", filters.status);
      if (filters.courseId) params.set("courseId", String(filters.courseId));
      return apiFetch<PaginatedQuizzes>("/teacher/quizzes?" + params.toString()).then(
        (r) => ({ ...r, data: r.data ?? [] }),
      );
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", formCourseId],
    queryFn: () =>
      apiFetch<{ data: TopicOption[] }>(`/teacher/topics?courseId=${formCourseId}`).then(
        (r) => r.data ?? [],
      ),
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
        body: JSON.stringify(quizCreateSchema.parse(body)),
      }),
    onSuccess: (quiz) => {
      queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success("Quiz created — opening builder");
      router.push(`${basePath}/${quiz.id}`);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setFormError(msg);
      toast.error(msg);
    },
  });

  const createPayload = {
    title: formTitle.trim(),
    quizType: formQuizType,
    courseId: track === "course" && formCourseId ? Number(formCourseId) : null,
    jambSubjectId: track === "jamb" && formSubjectId ? Number(formSubjectId) : null,
    topicId: formQuizType === "topic" && formTopicId ? Number(formTopicId) : null,
    weekStart: formQuizType === "course" ? formWeekStart || null : null,
  };
  const formReady =
    !subjectsPending &&
    !subjectsError &&
    quizCreateSchema.safeParse(createPayload).success;
  function handleCreate() {
    setFormError("");
    createMutation.mutate(createPayload);
  }

  const quizzes = quizzesQuery.data?.data ?? [];
  const filtersActive =
    filterMode !== "all" || filterCourse !== ALL || search.trim() !== "";
  const clearFilters = () => {
    setFilterMode("all");
    setFilterCourse(ALL);
    setSearch("");
    setPage(1);
  };
  const total = quizzesQuery.data?.meta.total ?? 0;

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Quizzes
          </h1>
          <p className="mt-1 text-base text-sub">
            {total} quizzes · create, edit and review attempts
          </p>
        </div>
        <Button
          className="min-h-11 gap-2 text-base"
          onClick={() => {
            resetForm();
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" /> New quiz
        </Button>
      </header>
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-3.5 size-4 text-sub"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search quizzes"
            placeholder="Search quizzes"
            maxLength={200}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="min-h-11 border-line bg-panel pl-10 text-base text-ink"
          />
        </div>
        <Tabs
          value={filterMode}
          onValueChange={(value) => {
            setFilterMode(value);
            setPage(1);
          }}
        >
          <TabsList
            aria-label="Filter quizzes"
            className="grid min-h-12 w-full grid-cols-4 rounded-xl border border-line bg-canvas p-1"
          >
            {[
              ["all", "All"],
              ["course", "Course"],
              ["topic", "Topic"],
              ["draft", "Drafts"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-11 min-w-0 rounded-lg px-2 text-base"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filterCourse}
            disabled={subjectsPending || subjectsError}
            onValueChange={(value) => {
              setFilterCourse(value);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="min-h-11 w-full border-line bg-panel text-base text-ink sm:w-64"
              aria-label="Filter by course"
            >
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
              <SelectItem value={ALL}>All courses</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={String(course.id)}>
                  {course.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-base text-sub"
              onClick={clearFilters}
            >
              <X className="size-4" /> Clear filters
            </Button>
          )}
        </div>
      </div>
      {subjectsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-base text-ruby"
        >
          <p>Could not load your courses and subjects.</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 text-base"
            onClick={() => refetchSubjects()}
          >
            Retry subjects
          </Button>
        </div>
      )}
      {quizzesQuery.isPending ? (
        <div aria-busy="true" aria-label="Loading quizzes" className="space-y-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : quizzesQuery.isError ? (
        <Card className="border-ruby/30 bg-panel p-5 text-center">
          <p role="alert" className="text-base text-ruby">
            {quizzesQuery.error.message}
          </p>
          <Button
            variant="outline"
            className="mx-auto min-h-11 text-base"
            onClick={() => quizzesQuery.refetch()}
          >
            Try again
          </Button>
        </Card>
      ) : quizzes.length === 0 ? (
        <Card className="border-dashed border-line bg-panel p-6 text-center">
          <SearchX className="mx-auto size-8 text-sub" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink">
            {filtersActive ? "No matching quizzes" : "Create your first quiz"}
          </h2>
          <p className="text-base leading-relaxed text-sub">
            {filtersActive
              ? "Try another search or clear your filters."
              : "Choose a course or subject, then add questions in the builder."}
          </p>
          <Button
            variant="outline"
            className="mx-auto min-h-11 text-base"
            onClick={
              filtersActive
                ? clearFilters
                : () => {
                    resetForm();
                    setEditorOpen(true);
                  }
            }
          >
            {filtersActive ? "Clear filters" : "New quiz"}
          </Button>
        </Card>
      ) : (
        <section aria-label="Quiz list" className="space-y-2">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_6rem_8rem_4rem_6rem] gap-3 px-4 text-sm font-semibold text-sub lg:grid"
          >
            <span>Quiz</span>
            <span>Type</span>
            <span>Course / subject</span>
            <span>Questions</span>
            <span>Status</span>
          </div>
          <ul className="space-y-2">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Card className="overflow-hidden border-line bg-panel py-0">
                  <Button
                    asChild
                    variant="ghost"
                    className="grid h-auto min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 whitespace-normal rounded-xl p-4 text-left hover:bg-canvas lg:grid-cols-[minmax(0,1fr)_6rem_8rem_4rem_6rem]"
                  >
                    <Link
                      href={basePath + "/" + quiz.id}
                      aria-label={"Open " + quiz.title}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_6rem_8rem_4rem_6rem]"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-base font-semibold text-ink">
                          {quiz.title}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-base font-normal text-sub lg:hidden">
                          <span>{TYPE_LABEL[quiz.quizType]}</span>
                          <span>
                            · {quiz.courseCode ?? quiz.subjectName ?? "No subject"}
                          </span>
                          <span>· {quiz.questionCount} questions</span>
                        </span>
                        {quiz.weekStart && (
                          <span className="mt-1 block text-base font-normal text-sub">
                            Week of {quiz.weekStart}
                          </span>
                        )}
                      </span>
                      <span className="hidden lg:block">
                        <Badge
                          variant="secondary"
                          className={
                            quiz.quizType === "course"
                              ? "bg-brand/10 text-ink"
                              : "bg-gold/10 text-ink"
                          }
                        >
                          {quiz.quizType === "course" ? "Course" : "Topic"}
                        </Badge>
                      </span>
                      <span className="hidden break-words text-base font-normal text-sub lg:block">
                        {quiz.courseCode ?? quiz.subjectName ?? "—"}
                      </span>
                      <span className="hidden text-base font-normal tabular-nums text-sub lg:block">
                        {quiz.questionCount}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          quiz.status === "published"
                            ? "bg-success/10 text-ink"
                            : "bg-canvas text-sub"
                        }
                      >
                        {quiz.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {quizzesQuery.data && quizzesQuery.data.meta.totalPages > 1 && (
        <nav
          aria-label="Quizzes pagination"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <Button
            variant="outline"
            className="min-h-11 text-base"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-base text-sub">
            Page {quizzesQuery.data.meta.page} of {quizzesQuery.data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            className="min-h-11 text-base"
            disabled={page >= quizzesQuery.data.meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          showCloseButton={false}
          className="bottom-0 left-0 right-0 top-auto max-h-[calc(100dvh-1rem)] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-ink sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <DialogHeader className="pr-12 text-left">
            <DialogTitle className="text-xl font-semibold">New quiz</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-sub">
              Choose the type and subject. Add questions and timing next.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="absolute right-2 top-2 size-11"
              aria-label="Close new quiz dialog"
            >
              <X className="size-5" />
            </Button>
          </DialogClose>
          <div className="space-y-4">
            {subjectsPending && (
              <p role="status" className="text-base text-sub">
                Loading courses and subjects…
              </p>
            )}
            {subjectsError && (
              <div role="alert" className="space-y-2 text-base text-ruby">
                <p>Could not load your courses and subjects.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 text-base"
                  onClick={() => refetchSubjects()}
                >
                  Retry subjects
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-quiz-title" className="text-base">
                Title
              </Label>
              <Input
                id="new-quiz-title"
                maxLength={200}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="min-h-11 text-base"
                placeholder="Quiz title"
              />
            </div>
            <Tabs
              value={formQuizType}
              onValueChange={(value) => {
                if (value === "topic" || value === "course") {
                  setFormQuizType(value);
                  setFormTopicId("");
                  setFormWeekStart("");
                }
              }}
            >
              <TabsList
                aria-label="Quiz type"
                className="grid min-h-12 w-full grid-cols-2"
              >
                <TabsTrigger
                  value="topic"
                  disabled={track === "jamb"}
                  className="min-h-11 text-base"
                >
                  Topic Quiz
                </TabsTrigger>
                <TabsTrigger value="course" className="min-h-11 text-base">
                  Course Quiz
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs
              value={track}
              onValueChange={(value) => {
                if (value === "course" || value === "jamb") {
                  setTrack(value);
                  setFormTopicId("");
                  if (value === "jamb") {
                    setFormQuizType("course");
                    setFormCourseId("");
                  }
                }
              }}
            >
              <TabsList
                aria-label="Quiz subject track"
                className="grid min-h-12 w-full grid-cols-2"
              >
                <TabsTrigger value="course" className="min-h-11 text-base">
                  Course
                </TabsTrigger>
                <TabsTrigger value="jamb" className="min-h-11 text-base">
                  JAMB subject
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-2">
              <Label htmlFor="new-quiz-subject" className="text-base">
                {track === "course" ? "Course" : "JAMB subject"}
              </Label>
              <Select
                value={track === "course" ? formCourseId : formSubjectId}
                onValueChange={(value) => {
                  if (track === "course") {
                    setFormCourseId(value);
                    setFormTopicId("");
                  } else setFormSubjectId(value);
                }}
              >
                <SelectTrigger
                  id="new-quiz-subject"
                  className="min-h-11 w-full text-base"
                >
                  <SelectValue
                    placeholder={track === "course" ? "Pick a course" : "Pick a subject"}
                  />
                </SelectTrigger>
                <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
                  {track === "course"
                    ? courses.map((course) => (
                        <SelectItem key={course.id} value={String(course.id)}>
                          {course.code} — {course.title}
                        </SelectItem>
                      ))
                    : subjects.map((subject) => (
                        <SelectItem key={subject.id} value={String(subject.id)}>
                          {subject.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            {formQuizType === "topic" ? (
              <div className="space-y-2">
                <Label htmlFor="new-quiz-topic" className="text-base">
                  Topic
                </Label>
                <Select
                  value={formTopicId}
                  onValueChange={setFormTopicId}
                  disabled={!formCourseId || topicsQuery.isPending}
                >
                  <SelectTrigger
                    id="new-quiz-topic"
                    className="min-h-11 w-full text-base"
                  >
                    <SelectValue
                      placeholder={
                        !formCourseId
                          ? "Pick a course first"
                          : topicsQuery.isPending
                            ? "Loading topics…"
                            : "Pick a topic"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
                    {(topicsQuery.data ?? []).map((topic) => (
                      <SelectItem key={topic.id} value={String(topic.id)}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {topicsQuery.isError && (
                  <div role="alert">
                    <p className="text-base text-ruby">Topics could not be loaded.</p>
                    <Button
                      variant="outline"
                      className="min-h-11 text-base"
                      onClick={() => topicsQuery.refetch()}
                    >
                      Retry topics
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="new-quiz-week" className="text-base">
                  Week start (Saturday)
                </Label>
                <Input
                  id="new-quiz-week"
                  type="date"
                  value={formWeekStart}
                  onChange={(e) => setFormWeekStart(e.target.value)}
                  className="min-h-11 text-base"
                />
                <p className="text-base text-sub">
                  Course quizzes open Saturday to Monday by default.
                </p>
              </div>
            )}
            {formError && (
              <p role="alert" className="text-base text-ruby">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 rounded-none border-line bg-panel p-0 pt-4">
            <Button
              className="min-h-11 w-full text-base sm:w-auto"
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
