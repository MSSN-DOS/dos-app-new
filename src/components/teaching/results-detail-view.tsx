"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type ResultRow = {
  userId: number;
  name: string;
  identifier: string;
  attempts: number;
  held: number;
  /** Best score across RELEASED attempts only — null while every attempt is still held. */
  bestScore: number | null;
};

type ResultsDetail = {
  quiz: {
    id: number;
    title: string;
    quizType: "topic" | "course";
    weekStart: string | null;
    status: "draft" | "published";
    passMark: number;
    questionCount: number;
    courseCode: string | null;
    subjectName: string | null;
  };
  stats: {
    attempts: number;
    releasedAttempts: number;
    heldAttempts: number;
    /** null until at least one attempt is released. */
    avgScore: number | null;
    passRate: number | null;
  };
  data: ResultRow[];
};

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`;
}

function StatCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      <p
        className="text-[28px] font-medium leading-none tabular-nums text-ink"
        style={{ fontFamily: "var(--font-fraunces), serif" }}
      >
        {value}
      </p>
      <p className="mt-2 text-[12.5px] font-semibold text-ink">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-sub">{sub}</p>
    </div>
  );
}

// Shared by /teacher/results/[quizId] and (later) any admin-shell twin.
export function ResultsDetailView({ backHref }: { backHref: string }) {
  const params = useParams<{ quizId: string }>();
  const quizId = params.quizId;

  const detailQuery = useQuery({
    queryKey: ["teacher", "results", quizId],
    queryFn: () => apiFetch<ResultsDetail>(`/teacher/results/${quizId}`),
  });

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6" aria-busy="true" aria-label="Loading results">
        <Skeleton className="h-[64px] w-full rounded-[18px] bg-line" />
        <div className="grid gap-[10px] sm:grid-cols-3">
          <Skeleton className="h-[118px] w-full rounded-[18px] bg-line" />
          <Skeleton className="h-[118px] w-full rounded-[18px] bg-line" />
          <Skeleton className="h-[118px] w-full rounded-[18px] bg-line" />
        </div>
        <Skeleton className="h-64 w-full rounded-[18px] bg-line" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <BackLink backHref={backHref} />
        <div role="alert" className="rounded-[18px] border border-line bg-panel p-5">
          <p className="text-sm font-medium text-ink">These results couldn&apos;t be loaded.</p>
          <p className="mt-1 break-words text-sm text-sub">
            {detailQuery.error instanceof ApiError
              ? detailQuery.error.message
              : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => void detailQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { quiz, stats, data } = detailQuery.data;
  const track = quiz.courseCode ?? quiz.subjectName ?? "—";
  const typeLabel = quiz.quizType === "course" ? "Course Quiz" : "Topic Quiz";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-3">
        <BackLink backHref={backHref} />
        <div>
          <p
            className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-brand"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Results
          </p>
          <h1
            className="text-[26px] font-medium leading-[1.25] tracking-[-0.01em] text-ink"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            {quiz.title}
          </h1>
          <p className="mt-[6px] text-[13px] leading-[1.5] text-sub">
            {typeLabel} · {track}
            {quiz.weekStart ? ` · week of ${quiz.weekStart}` : ""} · {quiz.questionCount}{" "}
            questions · pass mark {quiz.passMark}%
          </p>
        </div>
      </div>

      <div className="grid gap-[10px] sm:grid-cols-3">
        <StatCard
          value={String(stats.attempts)}
          label="Attempts"
          sub={
            stats.heldAttempts > 0
              ? `${stats.releasedAttempts} released · ${stats.heldAttempts} held`
              : "All released."
          }
        />
        <StatCard
          value={formatScore(stats.avgScore)}
          label="Avg score"
          sub={
            stats.avgScore === null
              ? "Nothing released yet."
              : "Across released attempts only."
          }
        />
        <StatCard
          value={formatScore(stats.passRate)}
          label="Pass rate"
          sub={
            stats.passRate === null
              ? "Nothing released yet."
              : `Scored ${quiz.passMark}% or better.`
          }
        />
      </div>

      {stats.heldAttempts > 0 ? (
        <p
          role="status"
          className="rounded-[14px] border border-gold/30 bg-gold/10 px-4 py-3 text-[12.5px] leading-relaxed text-sub"
        >
          {stats.heldAttempts === 1 ? "1 attempt is" : `${stats.heldAttempts} attempts are`} still
          held. The Board releases scores — until then those marks stay hidden here, and they
          aren&apos;t counted in the averages above.
        </p>
      ) : null}

      <section aria-label="Per-person results" className="space-y-3">
        <h2
          className="text-[16px] font-medium italic text-ink"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Who sat it
        </h2>

        {data.length === 0 ? (
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
              Nobody has sat this quiz yet. Check back once it opens.
            </p>
          </div>
        ) : (
          <ul role="list" className="space-y-2">
            {data.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[14px] border border-line bg-panel p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <p
                    className="mt-0.5 truncate text-xs text-faint"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {row.identifier}
                    {row.attempts > 1 ? ` · ${row.attempts} attempts` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {formatScore(row.bestScore)}
                  </p>
                  {row.bestScore === null ? (
                    <span className="inline-flex rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                      Held
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                      Released
                    </span>
                  )}
                  {row.held > 0 && row.bestScore !== null ? (
                    <span className="text-[11px] text-faint">
                      +{row.held} held
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackLink({ backHref }: { backHref: string }) {
  return (
    <Link
      href={backHref}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-sub hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      All results
    </Link>
  );
}
