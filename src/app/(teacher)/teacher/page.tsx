"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type DashboardResponse = {
  counts: { questionsAuthored: number; quizzesPublished: number };
  recent: { id: number; title: string; status: string; quizType: string; updatedAt: string }[];
};

type MeResponse = {
  data: { fullName: string; identifier: string };
};

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

function ErrorCardDark({ message, onRetry }: { message: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[18px] border border-line bg-panel p-5">
      <p className="text-sm font-medium text-ink">Dashboard data couldn&apos;t be loaded.</p>
      <p className="mt-1 break-words text-sm text-sub">
        {message instanceof ApiError ? message.message : "Check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Retry
      </button>
    </div>
  );
}

function StatCard({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
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

export default function TeacherDashboardPage() {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
  });

  const dashQuery = useQuery({
    queryKey: ["teacher-dashboard"],
    queryFn: () => apiFetch<DashboardResponse>("/teacher/dashboard"),
  });

  const fullName = meQuery.data?.data.fullName ?? "";
  const firstName = fullName ? firstNameOf(fullName) : "";

  if (dashQuery.isPending || meQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Skeleton className="h-[72px] w-full rounded-[18px] bg-line" />
        <div className="grid gap-[10px] sm:grid-cols-2">
          <Skeleton className="h-[118px] w-full rounded-[18px] bg-line" />
          <Skeleton className="h-[118px] w-full rounded-[18px] bg-line" />
        </div>
        <Skeleton className="h-32 w-full rounded-[18px] bg-line" />
      </div>
    );
  }

  if (dashQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <ErrorCardDark message={dashQuery.error} onRetry={() => void dashQuery.refetch()} />
      </div>
    );
  }

  const counts = dashQuery.data?.counts ?? { questionsAuthored: 0, quizzesPublished: 0 };
  const recent = dashQuery.data?.recent ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-0">
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
          {firstName ? (
            <>
              Welcome, {firstName} — <em className="font-medium italic text-gold">let&apos;s build</em>
            </>
          ) : (
            <>
              Teacher dashboard — <em className="font-medium italic text-gold">let&apos;s build</em>
            </>
          )}
        </h1>
        <p className="mt-[6px] max-w-[32ch] text-[13px] leading-[1.5] text-sub">
          Your questions and quizzes, at a glance.
        </p>
      </div>

      <div className="grid gap-[10px] sm:grid-cols-2">
        <StatCard
          value={String(counts.questionsAuthored)}
          label="Questions authored"
          sub="Across all courses and subjects you own."
        />
        <StatCard
          value={String(counts.quizzesPublished)}
          label="Quizzes published"
          sub="Visible to students and aspirants."
        />
      </div>

      <section aria-label="Recently published" className="space-y-3">
        <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          Recently published
        </h2>
        {recent.length === 0 ? (
          <EmptyDashed
            headline="Nothing published yet"
            sub="Create a question and publish a quiz — they’ll show up here."
          />
        ) : (
          <ul role="list" className="space-y-2">
            {recent.map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-panel p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{q.title}</p>
                  <p className="mt-1 text-xs text-sub">
                    {q.quizType === "course" ? "Course" : "Topic"} ·{" "}
                    <span
                      className={
                        q.status === "published"
                          ? "inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand"
                          : "inline-flex rounded-full bg-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sub"
                      }
                    >
                      {q.status}
                    </span>
                  </p>
                </div>
                <Link
                  href={`/teacher/quizzes/${q.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-[11px] border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/teacher/questions"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[11px] bg-brand px-4 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_var(--dos-aura)] hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          + New question
        </Link>
        <Link
          href="/teacher/quizzes"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[11px] border border-edge bg-panel px-4 text-sm font-semibold text-ink hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          + New quiz
        </Link>
      </div>
    </div>
  );
}
