"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  Layers,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Spinner } from "@/components/ui/spinner";
import { useAuthoringSubjects } from "@/components/teaching/use-authoring-subjects";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";
import { isSaturday, nextSaturday } from "@/lib/quizzes/saturday";
import { cn } from "@/lib/utils";
import { quizCreateSchema, type QuizCreateInput } from "@/lib/validation/quizzes";

type QuizType = "topic" | "course";
type Track = "course" | "jamb";
type TopicOption = { id: number; title: string; courseId: number };

const MONO = { fontFamily: "JetBrains Mono, monospace" } as const;
const SERIF = { fontFamily: "var(--font-fraunces), serif" } as const;

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint"
      style={MONO}
    >
      {children}
    </label>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint"
      style={MONO}
    >
      {children}
    </p>
  );
}

// Inset track + raised thumb, per QUIZBOOT_SPEC §3.3. Descriptions appear from md up.
function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon: ReactNode; hint?: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-xl border border-line bg-canvas p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (step === 0) return;

              event.preventDefault();
              const radios = Array.from(
                event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                  '[role="radio"]',
                ) ?? [],
              );
              if (radios.length === 0) return;
              const nextIndex =
                (radios.indexOf(event.currentTarget) + step + radios.length) %
                radios.length;
              radios[nextIndex]?.focus();
              const nextOption = options[nextIndex];
              if (nextOption) onChange(nextOption.value);
            }}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              active
                ? "border border-line bg-panel text-brand shadow-sm"
                : "border border-transparent text-sub hover:text-ink",
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {o.icon}
              {o.label}
            </span>
            {o.hint ? (
              <span className="hidden text-[11px] font-normal text-faint md:block">
                {o.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function NewQuizForm({
  basePath,
  onDone,
}: {
  basePath: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    courses,
    jambSubjects,
    isPending: subjectsPending,
    isError: subjectsError,
    refetch: refetchSubjects,
  } = useAuthoringSubjects();

  const [title, setTitle] = useState("");
  const [quizType, setQuizType] = useState<QuizType>("course");
  const [track, setTrack] = useState<Track>("course");
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [weekStart, setWeekStart] = useState(() => nextSaturday());
  const [error, setError] = useState("");

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", courseId],
    queryFn: () =>
      apiFetch<{ data: TopicOption[] }>(`/teacher/topics?courseId=${courseId}`).then(
        (r) => r.data ?? [],
      ),
    enabled: quizType === "topic" && track === "course" && courseId !== "",
  });

  const createMutation = useMutation({
    mutationFn: (body: QuizCreateInput) =>
      apiFetch<{ id: number }>("/teacher/quizzes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (quiz) => {
      queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success("Quiz created — opening builder");
      onDone();
      router.push(`${basePath}/${quiz.id}`);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    },
  });

  const createPayload = {
    title: title.trim(),
    quizType,
    courseId: track === "course" && courseId !== "" ? Number(courseId) : null,
    jambSubjectId: track === "jamb" && subjectId !== "" ? Number(subjectId) : null,
    topicId: quizType === "topic" && topicId !== "" ? Number(topicId) : null,
    weekStart: quizType === "course" ? weekStart || null : null,
  };
  const parsedCreate = quizCreateSchema.safeParse(createPayload);
  const weekOk = isSaturday(weekStart);
  const ready =
    !subjectsPending && !subjectsError && !topicsQuery.isError && parsedCreate.success;

  const selectedCourse = courses.find((course) => String(course.id) === courseId);
  const selectedSubject = jambSubjects.find(
    (subject) => String(subject.id) === subjectId,
  );
  const selectedTopic = (topicsQuery.data ?? []).find(
    (topic) => String(topic.id) === topicId,
  );

  function changeQuizType(next: QuizType) {
    setQuizType(next);
    setError("");
    setTopicId("");

    if (next === "topic") {
      // Topics are course-scoped in the data model, so do not leave the form in an
      // impossible Topic + JAMB state that the server must reject later.
      setTrack("course");
      setSubjectId("");
      setWeekStart("");
      return;
    }

    setWeekStart((current) => (isSaturday(current) ? current : nextSaturday()));
  }

  function changeTrack(next: Track) {
    setTrack(next);
    setError("");
    setTopicId("");
    if (next === "course") setSubjectId("");
    else setCourseId("");
  }

  function submit() {
    setError("");
    if (!parsedCreate.success) {
      setError(parsedCreate.error.issues[0]?.message ?? "Complete the required fields");
      return;
    }
    createMutation.mutate(parsedCreate.data);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !createMutation.isPending) submit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-1 md:px-6">
        <section
          className="space-y-4 rounded-2xl border border-line bg-canvas/55 p-3.5 md:p-4"
          aria-labelledby="quiz-basics-heading"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold tabular-nums text-canvas">
              1
            </span>
            <div>
              <h3 id="quiz-basics-heading" className="text-sm font-semibold text-ink">
                Quiz basics
              </h3>
              <p className="text-xs text-faint">
                Give the draft a name and choose its format.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <FieldLabel htmlFor="new-quiz-title">Title</FieldLabel>
              <span
                className="mb-1.5 shrink-0 text-[11px] tabular-nums text-faint"
                style={MONO}
              >
                {title.length}/200
              </span>
            </div>
            <Input
              id="new-quiz-title"
              value={title}
              maxLength={200}
              autoFocus
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder="e.g. MAT 101 · Week 4"
              className="min-h-11 rounded-xl border-line bg-panel text-base text-ink placeholder:text-faint md:text-sm"
            />
          </div>

          <div>
            <GroupLabel>Quiz type</GroupLabel>
            <Segmented<QuizType>
              label="Quiz type"
              value={quizType}
              onChange={changeQuizType}
              options={[
                {
                  value: "course",
                  label: "Course",
                  icon: <GraduationCap className="size-4" />,
                  hint: "Weekly · official score",
                },
                {
                  value: "topic",
                  label: "Topic",
                  icon: <Layers className="size-4" />,
                  hint: "Ad-hoc · practice",
                },
              ]}
            />
          </div>
        </section>

        <section
          className="space-y-4 rounded-2xl border border-line bg-canvas/55 p-3.5 md:p-4"
          aria-labelledby="quiz-placement-heading"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold tabular-nums text-canvas">
              2
            </span>
            <div>
              <h3 id="quiz-placement-heading" className="text-sm font-semibold text-ink">
                Scope &amp; schedule
              </h3>
              <p className="text-xs text-faint">Place it in the right academic track.</p>
            </div>
          </div>

          {quizType === "course" ? (
            <div>
              <GroupLabel>For</GroupLabel>
              <Segmented<Track>
                label="Academic track"
                value={track}
                onChange={changeTrack}
                options={[
                  {
                    value: "course",
                    label: "Students",
                    icon: <BookOpenCheck className="size-4" />,
                    hint: "University course",
                  },
                  {
                    value: "jamb",
                    label: "Aspirants",
                    icon: <Sparkles className="size-4" />,
                    hint: "JAMB subject",
                  },
                ]}
              />
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/10 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel text-brand">
                <BookOpenCheck className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Course topic</p>
                <p className="text-xs leading-relaxed text-sub">
                  Topic quizzes are course-scoped practice, so JAMB subjects are not
                  offered here.
                </p>
              </div>
            </div>
          )}

          {subjectsPending ? (
            <div
              role="status"
              aria-label="Loading academic catalogue"
              className="space-y-2"
            >
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-3 w-2/3 rounded-full" />
            </div>
          ) : subjectsError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ruby/30 bg-ruby/10 p-3"
            >
              <p className="text-sm text-ruby">
                The academic catalogue could not be loaded.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 rounded-xl border-line bg-panel text-ink"
                onClick={() => void refetchSubjects()}
              >
                <RefreshCw className="size-4" /> Retry
              </Button>
            </div>
          ) : track === "course" ? (
            <div>
              <FieldLabel htmlFor="new-quiz-course">Course</FieldLabel>
              <Select
                value={courseId}
                onValueChange={(value) => {
                  setCourseId(value);
                  setTopicId("");
                  setError("");
                }}
                disabled={courses.length === 0}
              >
                <SelectTrigger
                  id="new-quiz-course"
                  aria-label="Course"
                  className="min-h-11 w-full rounded-xl border-line bg-panel text-base text-ink md:text-sm"
                >
                  <SelectValue
                    placeholder={
                      courses.length === 0 ? "No courses available" : "Pick a course"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  {courses.map((course) => (
                    <SelectItem
                      className="min-h-11 text-base md:text-sm"
                      key={course.id}
                      value={String(course.id)}
                    >
                      {course.code} — {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {courses.length === 0 ? (
                <p className="mt-1.5 text-xs text-faint">
                  No course is available for quiz authoring yet.
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <FieldLabel htmlFor="new-quiz-subject">JAMB subject</FieldLabel>
              <Select
                value={subjectId}
                onValueChange={(value) => {
                  setSubjectId(value);
                  setError("");
                }}
                disabled={jambSubjects.length === 0}
              >
                <SelectTrigger
                  id="new-quiz-subject"
                  aria-label="JAMB subject"
                  className="min-h-11 w-full rounded-xl border-line bg-panel text-base text-ink md:text-sm"
                >
                  <SelectValue
                    placeholder={
                      jambSubjects.length === 0
                        ? "No subjects available"
                        : "Pick a subject"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  {jambSubjects.map((subject) => (
                    <SelectItem
                      className="min-h-11 text-base md:text-sm"
                      key={subject.id}
                      value={String(subject.id)}
                    >
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {jambSubjects.length === 0 ? (
                <p className="mt-1.5 text-xs text-faint">
                  No JAMB subject is available for quiz authoring yet.
                </p>
              ) : null}
            </div>
          )}

          {quizType === "topic" ? (
            <div>
              <FieldLabel htmlFor="new-quiz-topic">Topic</FieldLabel>
              <Select
                value={topicId}
                onValueChange={(value) => {
                  setTopicId(value);
                  setError("");
                }}
                disabled={
                  courseId === "" ||
                  topicsQuery.isPending ||
                  topicsQuery.isError ||
                  (topicsQuery.data ?? []).length === 0
                }
              >
                <SelectTrigger
                  id="new-quiz-topic"
                  aria-label="Topic"
                  className="min-h-11 w-full rounded-xl border-line bg-panel text-base text-ink md:text-sm"
                >
                  <SelectValue
                    placeholder={
                      courseId === ""
                        ? "Pick a course first"
                        : topicsQuery.isPending
                          ? "Loading topics…"
                          : topicsQuery.isError
                            ? "Topics unavailable"
                            : (topicsQuery.data ?? []).length === 0
                              ? "No topics for this course"
                              : "Pick a topic"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="border-line bg-panel text-ink">
                  {(topicsQuery.data ?? []).map((topic) => (
                    <SelectItem
                      className="min-h-11 text-base md:text-sm"
                      key={topic.id}
                      value={String(topic.id)}
                    >
                      {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {courseId !== "" && topicsQuery.isPending ? (
                <p role="status" className="mt-1.5 text-xs text-faint">
                  Loading topics for this course…
                </p>
              ) : null}
              {courseId !== "" && topicsQuery.isError ? (
                <div
                  role="alert"
                  className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ruby/30 bg-ruby/10 p-3"
                >
                  <p className="text-sm text-ruby">Topics could not be loaded.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 rounded-xl border-line bg-panel text-ink"
                    onClick={() => void topicsQuery.refetch()}
                  >
                    <RefreshCw className="size-4" /> Retry
                  </Button>
                </div>
              ) : null}
              {courseId !== "" &&
              !topicsQuery.isPending &&
              !topicsQuery.isError &&
              (topicsQuery.data ?? []).length === 0 ? (
                <p className="mt-1.5 text-xs leading-relaxed text-faint">
                  This course has no topics yet. Add a topic first, then return to create
                  the quiz.
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <FieldLabel htmlFor="new-quiz-week">Week starts</FieldLabel>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <div className="relative min-w-0 flex-1 basis-48">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    id="new-quiz-week"
                    type="date"
                    value={weekStart}
                    onChange={(e) => {
                      setWeekStart(e.target.value);
                      setError("");
                    }}
                    aria-invalid={weekStart !== "" && !weekOk}
                    aria-describedby="new-quiz-week-help"
                    className="min-h-11 rounded-xl border-line bg-panel pl-9 text-base text-ink md:text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWeekStart(nextSaturday())}
                  className="min-h-11 shrink-0 rounded-xl border-line bg-panel px-3 text-sm font-semibold text-brand hover:bg-line"
                >
                  Next Saturday
                </Button>
              </div>
              <p
                id="new-quiz-week-help"
                className={cn(
                  "mt-1.5 text-xs leading-relaxed",
                  weekStart !== "" && !weekOk ? "text-ruby" : "text-faint",
                )}
                role={weekStart !== "" && !weekOk ? "alert" : undefined}
              >
                {weekStart !== "" && !weekOk
                  ? "Choose a Saturday for the weekly quiz."
                  : "Default window: Saturday 00:00 to Monday 00:00 WAT. Refine it later in Settings."}
              </p>
            </div>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-brand/30 bg-brand/10 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white">
            {quizType === "course" ? (
              <GraduationCap className="size-4" />
            ) : (
              <Layers className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {title.trim() || "Untitled quiz"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-sub">
              {quizType === "course"
                ? `${track === "course" ? (selectedCourse?.code ?? "Choose a course") : (selectedSubject?.name ?? "Choose a JAMB subject")} · Weekly official quiz`
                : `${selectedCourse?.code ?? "Choose a course"}${selectedTopic ? ` · ${selectedTopic.title}` : " · Choose a topic"} · Practice quiz`}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-brand">
              Question builder opens next
            </p>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line bg-panel px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="min-h-11 rounded-xl px-4 text-sm font-semibold text-sub hover:bg-line hover:text-ink"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!ready || createMutation.isPending}
          className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
        >
          {createMutation.isPending ? (
            <>
              <Spinner /> Creating…
            </>
          ) : (
            <>
              Create &amp; continue <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Bottom sheet on phones, centred dialog from md up (QUIZBOOT_SPEC §3.3 / §5.2). The form lives
// inside DialogContent, which Radix unmounts on close — so every open starts with a clean form
// and nothing needs resetting by hand.
export function NewQuizDialog({
  open,
  onOpenChange,
  basePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-x-0 bottom-0 top-auto flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-2xl border border-line bg-panel p-0 text-ink ring-0 [&>[data-slot=dialog-close]]:size-11 [&>[data-slot=dialog-close]]:rounded-xl md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[min(90dvh,48rem)] md:max-w-[640px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <div
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line md:hidden"
          aria-hidden
        />
        <DialogHeader className="mb-3 shrink-0 border-b border-line bg-canvas/65 px-4 pb-4 pr-16 pt-3 text-left md:px-6 md:pb-5 md:pt-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
              <BookOpenCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand"
                style={MONO}
              >
                New quiz
              </p>
              <DialogTitle
                className="mt-0.5 text-xl font-bold leading-tight tracking-tight text-ink"
                style={SERIF}
              >
                Create a draft
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-sub">
                Set the essentials now. Questions, settings and preview come next in the
                builder.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <NewQuizForm basePath={basePath} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
