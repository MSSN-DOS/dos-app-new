"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/auth/client-fetch";
import { QuizPreviewAction } from "./quiz-preview-action";
import type { catalogDetails } from "@/lib/db/catalog-details";
type Details = NonNullable<Awaited<ReturnType<typeof catalogDetails>>>;

function Pager({
  meta,
  onPage,
}: {
  meta: Details["topics"]["meta"];
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <Button
        variant="outline"
        className="min-h-11"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {meta.page} of {meta.totalPages}
      </span>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
export function CatalogDetails({ id, kind }: { id: number; kind: "course" | "topic" }) {
  const [topicPage, setTopicPage] = useState(1);
  const [quizPage, setQuizPage] = useState(1);
  const query = useQuery({
    queryKey: ["catalog-details", kind, id, topicPage, quizPage],
    queryFn: () =>
      apiFetch<{ data: Details }>(
        `/teacher/catalog/${id}?kind=${kind}&topicPage=${topicPage}&quizPage=${quizPage}`,
      ),
  });
  if (query.isPending)
    return (
      <p role="status" className="p-5 text-base text-muted-foreground">
        Loading details…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-5">
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry</Button>
      </div>
    );
  const { course, topic, topics, quizzes } = query.data.data;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{topic?.title ?? course.title}</h2>
        <p className="text-base text-muted-foreground">
          {course.code} · {course.title}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {Object.entries({
          Session: course.session,
          Level: `${course.level}L`,
          Semester: course.semester,
          Scope: course.scope,
          Department: course.department,
          Faculty: course.faculty,
          "Shared faculties": course.sharedFaculties,
          ...(topic
            ? { Created: new Date(topic.createdAt).toLocaleDateString("en-NG") }
            : {}),
        })
          .filter(([, value]) => value != null)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="break-words text-base font-medium capitalize">{value}</dd>
            </div>
          ))}
      </dl>
      {kind === "course" && (
        <section
          aria-label="Course topics"
          className="rounded-xl border border-border bg-card p-5"
        >
          <h3 className="text-lg font-semibold">
            Topics <span className="text-muted-foreground">({topics.meta.total})</span>
          </h3>
          {topics.data.length ? (
            <ul className="divide-y divide-border">
              {topics.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 break-words text-base">{row.title}</span>
                  <TopicDetailsAction id={row.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-base text-muted-foreground">
              No topics are attached to this course yet.
            </p>
          )}
          <Pager meta={topics.meta} onPage={setTopicPage} />
        </section>
      )}
      <section
        aria-label="Attached quizzes"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h3 className="text-lg font-semibold">
          {kind === "course" ? "Course quizzes" : "Topic quizzes"}{" "}
          <span className="text-muted-foreground">({quizzes.meta.total})</span>
        </h3>
        {quizzes.data.length ? (
          <ul className="divide-y divide-border">
            {quizzes.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-base font-medium">
                    {row.title || "Untitled quiz"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.status} · {row.questionCount} questions
                    {row.weekStart ? ` · ${row.weekStart}` : ""}
                  </p>
                </div>
                <QuizPreviewAction id={row.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-base text-muted-foreground">
            No {kind === "course" ? "course" : "topic"} quizzes are attached yet.
          </p>
        )}
        <Pager meta={quizzes.meta} onPage={setQuizPage} />
      </section>
    </div>
  );
}
export function TopicDetailsAction({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="min-h-11" onClick={() => setOpen(true)}>
        <Eye className="size-4" />
        View
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Topic details</DialogTitle>
            <DialogDescription>
              Course information and attached topic quizzes.
            </DialogDescription>
          </DialogHeader>
          {open && <CatalogDetails key={id} kind="topic" id={id} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function CourseDetailsLink({ id }: { id: number }) {
  return (
    <Button asChild variant="ghost" className="min-h-11">
      <Link href={`/admin/structure/courses/${id}`}>
        <Eye className="size-4" />
        View
      </Link>
    </Button>
  );
}
