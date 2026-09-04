"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/auth/auth-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type Attempt = {
  id: number;
  quizId: number;
  attemptNumber: number;
  title: string;
  quizType: "topic" | "course";
  courseId: number | null;
  courseCode: string | null;
  topicId: number | null;
  topicTitle: string | null;
  jambSubjectId: number | null;
  subjectName: string | null;
  weekStart: string | null;
  attemptedAt: string | null;
  score?: number;
  bestScore?: number;
};

type HistoryResponse = {
  data: Attempt[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    courses: Array<{ id: number; code: string }>;
    jambSubjects: Array<{ id: number; name: string }>;
  };
};

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  const isHeld = attempt.quizType === "course" && attempt.score === undefined;
  const context = attempt.quizType === "topic" ? (attempt.topicTitle ?? "Topic practice") : (attempt.courseCode ?? "Course Quiz");

  return (
    <TableRow className="border-line hover:bg-line/40">
      <TableCell className="min-w-52 whitespace-normal">
        <p className="break-words font-medium text-ink">{attempt.title}</p>
        <p className="break-words text-sm text-sub">
          {context} · Attempt {attempt.attemptNumber}
        </p>
      </TableCell>
      <TableCell>
        <p className="text-ink">{attempt.quizType === "course" ? "Course Quiz" : "Topic Quiz"}</p>
        {attempt.weekStart && <p className="text-sm text-sub">Week of {attempt.weekStart}</p>}
      </TableCell>
      <TableCell className="whitespace-normal">
        <p className="text-ink">{formatDate(attempt.attemptedAt)}</p>
        {!isHeld && attempt.bestScore !== undefined && <p className="text-sm text-sub">Best: {attempt.bestScore}%</p>}
      </TableCell>
      <TableCell className="text-right align-middle">
        <span
          className={
            isHeld
              ? "inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-3 text-sm font-medium tabular-nums text-sub"
              : "inline-flex min-h-11 items-center rounded-md bg-brand px-3 text-sm font-medium tabular-nums text-white"
          }
          aria-label={isHeld ? "Score pending release" : `Score ${attempt.score}%`}
        >
          {isHeld ? "Awaiting release" : `${attempt.score}%`}
        </span>
      </TableCell>
    </TableRow>
  );
}

function AttemptCard({ attempt }: { attempt: Attempt }) {
  const isHeld = attempt.quizType === "course" && attempt.score === undefined;
  const isTopic = attempt.quizType === "topic";
  const context = isTopic ? (attempt.topicTitle ?? "Topic practice") : (attempt.courseCode ?? "Course Quiz");
  const typeLabel = isTopic ? "Topic Quiz" : "Course Quiz";
  const scoreLabel = isHeld ? "Score pending release" : `Score ${attempt.score}%`;

  return (
    <article className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[15px] font-medium leading-snug text-ink">{attempt.title}</p>
          <p className="mt-1 break-words text-[13px] leading-relaxed text-sub">
            {context} · Attempt {attempt.attemptNumber}
          </p>
        </div>
        <span
          className={
            isTopic
              ? "inline-flex shrink-0 items-center rounded-md border border-gold/20 bg-gold/10 px-2 py-1 text-[11px] font-semibold tracking-wide text-gold"
              : "inline-flex shrink-0 items-center rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-[11px] font-semibold tracking-wide text-brand"
          }
        >
          {typeLabel}
        </span>
      </div>

      {attempt.weekStart && <p className="mt-2.5 text-[13px] text-sub">Week of {attempt.weekStart}</p>}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{formatDate(attempt.attemptedAt)}</p>
          {isHeld ? (
            <p className="mt-0.5 text-xs text-sub">Held until the Board releases it</p>
          ) : (
            attempt.bestScore !== undefined && <p className="mt-0.5 text-xs text-sub">Best: {attempt.bestScore}%</p>
          )}
        </div>
        <span
          className={
            isHeld
              ? "inline-flex min-h-9 shrink-0 items-center rounded-lg border border-edge bg-line px-2.5 text-xs font-medium tabular-nums text-sub"
              : "inline-flex min-h-9 shrink-0 items-center rounded-lg bg-brand px-3 text-sm font-semibold tabular-nums text-white"
          }
          aria-label={scoreLabel}
        >
          {isHeld ? "Awaiting release" : `${attempt.score}%`}
        </span>
      </div>
    </article>
  );
}

function EmptyDashed({ headline, sub }: { headline: string; sub: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-edge bg-transparent px-5 py-[30px] text-center">
      <div className="mx-auto mb-[14px] flex size-[46px] items-center justify-center rounded-full bg-gold/13">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-gold"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      </div>
      <p className="mb-[5px] text-[14.5px] text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
        {headline}
      </p>
      <p className="mx-auto max-w-[26ch] text-[12px] leading-[1.55] text-sub">{sub}</p>
    </div>
  );
}

export default function HistoryPage() {
  const { user } = useAuth();
  const isAspirant = user?.role === "aspirant";
  const [type, setType] = useState("all");
  const [filterId, setFilterId] = useState("all");
  const [page, setPage] = useState(1);
  const filterName = isAspirant ? "jambSubjectId" : "courseId";
  const query = new URLSearchParams();
  if (type !== "all") query.set("type", type);
  if (filterId !== "all") query.set(filterName, filterId);
  query.set("page", String(page));
  query.set("pageSize", "10");
  const queryString = query.toString();

  const attemptsQuery = useQuery({
    queryKey: ["history", user?.id, user?.role, type, filterId, page],
    queryFn: () => apiFetch<HistoryResponse>(`/me/attempts${queryString ? `?${queryString}` : ""}`),
  });

  const attempts = attemptsQuery.data?.data ?? [];
  const meta = attemptsQuery.data?.meta;
  const filterOptions = isAspirant ? (attemptsQuery.data?.filters.jambSubjects ?? []) : (attemptsQuery.data?.filters.courses ?? []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          History
        </h1>
        <p className="mt-2 max-w-2xl break-words text-[13px] leading-relaxed text-sub">
          Review completed practice and course attempts. Course Quiz scores stay hidden until released.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value);
            setFilterId("all");
            setPage(1);
          }}
        >
          <SelectTrigger
            className="min-h-11 w-full rounded-md border-line bg-panel text-ink data-[placeholder]:text-faint focus:ring-brand"
            aria-label="Filter by quiz type"
          >
            <SelectValue placeholder="All quiz types" />
          </SelectTrigger>
          <SelectContent className="border-line bg-panel text-ink">
            <SelectItem value="all">All quiz types</SelectItem>
            <SelectItem value="course">Course Quizzes</SelectItem>
            <SelectItem value="topic">Topic Quizzes</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterId}
          onValueChange={(value) => {
            setFilterId(value);
            setPage(1);
          }}
        >
          <SelectTrigger
            className="min-h-11 w-full rounded-md border-line bg-panel text-ink data-[placeholder]:text-faint focus:ring-brand"
            aria-label={isAspirant ? "Filter by JAMB subject" : "Filter by course"}
          >
            <SelectValue placeholder={isAspirant ? "All JAMB subjects" : "All courses"} />
          </SelectTrigger>
          <SelectContent className="border-line bg-panel text-ink">
            <SelectItem value="all">{isAspirant ? "All JAMB subjects" : "All courses"}</SelectItem>
            {filterOptions.map((option) => (
              <SelectItem key={option.id} value={String(option.id)}>
                {"name" in option ? option.name : option.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {attemptsQuery.isPending && (
        <div className="space-y-3" aria-label="Loading history" aria-busy="true">
          <Skeleton className="h-36 w-full rounded-[18px] bg-line" />
          <Skeleton className="h-36 w-full rounded-[18px] bg-line" />
        </div>
      )}

      {attemptsQuery.isError && (
        <div role="alert" className="rounded-[18px] border border-line bg-panel p-5">
          <p className="text-sm font-medium text-ink">History couldn&apos;t be loaded.</p>
          <p className="mt-1 break-words text-sm text-sub">
            {attemptsQuery.error instanceof ApiError ? attemptsQuery.error.message : "Check your connection and try again."}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => void attemptsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {attemptsQuery.isSuccess && attempts.length === 0 && (
        <EmptyDashed headline="No attempts match" sub="Clear filters or complete a quiz — it will appear here." />
      )}

      {attempts.length > 0 && (
        <div className="space-y-3 lg:hidden" aria-label="Quiz attempt history">
          {attempts.map((attempt) => (
            <AttemptCard key={attempt.id} attempt={attempt} />
          ))}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-panel/50 lg:block" aria-label="Quiz attempt history">
          <Table>
            <TableHeader>
              <TableRow className="border-line hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.08em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  Quiz
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.08em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  Type
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.08em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  Submitted
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.08em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  Score
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => (
                <AttemptRow key={attempt.id} attempt={attempt} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-sub" aria-live="polite">
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none"
              disabled={page === 1 || attemptsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none"
              disabled={page >= meta.totalPages || attemptsQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
