"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2, Search } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type ResultQuizRow = {
  quizId: number;
  title: string;
  quizType: "topic" | "course";
  weekStart: string | null;
  status: "draft" | "published";
  courseCode: string | null;
  subjectName: string | null;
  attempts: number;
  released: number;
  held: number;
};

// Shared by /teacher/results and (later) any admin-shell twin — the API is role-guarded
// admin+teacher, so the same UI serves both shells. `basePath` is the route prefix used
// to open one quiz's results.
export function ResultsView({ basePath }: { basePath: string }) {
  const resultsQuery = useQuery({
    queryKey: ["teacher", "results"],
    queryFn: () =>
      apiFetch<{ data: ResultQuizRow[] }>("/teacher/results").then((r) => r.data ?? []),
  });

  if (resultsQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4" aria-busy="true" aria-label="Loading results">
        <Skeleton className="h-[64px] w-full rounded-[18px] bg-line" />
        <Skeleton className="h-[92px] w-full rounded-[18px] bg-line" />
        <Skeleton className="h-[92px] w-full rounded-[18px] bg-line" />
      </div>
    );
  }

  if (resultsQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div role="alert" className="rounded-[18px] border border-line bg-panel p-5">
          <p className="text-sm font-medium text-ink">Results couldn&apos;t be loaded.</p>
          <p className="mt-1 break-words text-sm text-sub">
            {resultsQuery.error instanceof ApiError
              ? resultsQuery.error.message
              : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => void resultsQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const rows = resultsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p
          className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-brand"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Teacher
        </p>
        <h1
          className="text-[26px] font-medium leading-[1.25] tracking-[-0.01em] text-ink"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Results
        </h1>
        <p className="mt-[6px] max-w-[46ch] text-[13px] leading-[1.5] text-sub">
          Quizzes of yours that people have sat. Scores stay hidden until the Board releases
          them — you&apos;ll see the attempt either way.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-edge bg-transparent px-5 py-[30px] text-center">
          <div className="mx-auto mb-[14px] flex size-[46px] items-center justify-center rounded-full bg-gold/13">
            <Search className="size-5 text-gold" aria-hidden="true" />
          </div>
          <p
            className="mb-[5px] text-[14.5px] text-ink"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            No attempts yet
          </p>
          <p className="mx-auto max-w-[34ch] text-[12px] leading-[1.55] text-sub">
            Once someone sits one of your quizzes it appears here, whether or not its scores
            have been released.
          </p>
          <Link
            href="/teacher/quizzes"
            className="mt-4 inline-flex min-h-11 items-center rounded-[11px] border border-edge bg-panel px-4 text-sm font-medium text-ink hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Go to quizzes
          </Link>
        </div>
      ) : (
        <ul role="list" className="space-y-2">
          {rows.map((row) => {
            const track = row.courseCode ?? row.subjectName ?? "—";
            const typeLabel = row.quizType === "course" ? "Course Quiz" : "Topic Quiz";
            return (
              <li
                key={row.quizId}
                className="rounded-[18px] border border-line bg-panel p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-ink">{row.title}</p>
                    <p className="mt-1 text-xs text-sub">
                      {typeLabel} · {track}
                      {row.weekStart ? ` · week of ${row.weekStart}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex rounded-full bg-brand/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-brand">
                        {row.attempts} {row.attempts === 1 ? "attempt" : "attempts"}
                      </span>
                      {row.held > 0 ? (
                        <span className="inline-flex rounded-full bg-gold/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-gold">
                          {row.held} held
                        </span>
                      ) : null}
                      {row.released > 0 ? (
                        <span className="inline-flex rounded-full bg-line px-2 py-0.5 font-semibold uppercase tracking-wide text-sub">
                          {row.released} released
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href={`${basePath}/${row.quizId}`}
                    aria-label={`View results for ${row.title}`}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[11px] border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    View results
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
