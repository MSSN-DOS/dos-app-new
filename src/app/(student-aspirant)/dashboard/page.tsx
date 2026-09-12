"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/auth/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type MeResponse = {
  data: {
    id: number;
    fullName: string;
    identifier: string;
    role: string;
    activeSemester: "harmattan" | "rain" | null;
    profile:
      | {
          faculty: string | null;
          department: string | null;
          level: number | null;
          cgpa: number | null;
          cgpaWeekStart: string | null;
          quizzesTaken: number;
        }
      | {
          aspirationDepartment: string | null;
          postUtmeRaw: number | null;
          postUtmeConverted: number | null;
          postUtmeWeekStart: string | null;
          quizzesTaken: number;
        }
      | null;
  };
};

type QuizRow = {
  id: number;
  title: string;
  quizType: "topic" | "course";
  courseCode?: string | null;
  jambSubjectId?: number | null;
  subjectName?: string | null;
  weekStart: string | null;
  questionCount: number;
  timeLimitMinutes: number | null;
};

type AttemptRow = {
  quizId: number;
  quizType: "topic" | "course";
  score?: number;
};

type AttemptsResponse = { data: AttemptRow[] };

type ListItem = { id: number; label: string; questionCount: number; timeLimitMinutes: number | null };

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

function formatCgpa(value: number | null): string {
  if (value == null) return "0.00";
  const n = Number(value);
  const normalized = n > 5 ? n / 20 : n;
  return normalized.toFixed(2);
}

function formatPostUtme(raw: number | null, converted: number | null): string {
  if (raw != null) return `${raw} / 50`;
  if (converted != null) return `${converted} / 50`;
  return "0 / 50";
}

function SemesterPills({ activeSemester }: { activeSemester: "harmattan" | "rain" | null }) {
  return (
    <div className="flex gap-1.5 rounded-[14px] border border-line bg-panel p-1">
      {(["harmattan", "rain"] as const).map((semester) => {
        const active = semester === activeSemester;
        return (
          <button
            key={semester}
            type="button"
            aria-pressed={active}
            className={
              active
                ? "flex-1 rounded-[11px] bg-[linear-gradient(155deg,var(--dos-brand),var(--dos-brand-press))] px-3 py-[10px] text-[12.5px] font-semibold capitalize text-white shadow-[0_4px_14px_-4px_var(--dos-aura)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0"
                : "flex-1 rounded-[11px] bg-transparent px-3 py-[10px] text-[12.5px] font-semibold capitalize text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0"
            }
          >
            {semester}
          </button>
        );
      })}
    </div>
  );
}

function HeroCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(155deg,var(--dos-panel),var(--dos-sunk))] p-[22px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[20%] -top-[40%] h-[200px] w-[200px] rounded-full blur-[4px]"
        style={{ background: "radial-gradient(circle, var(--dos-aura), transparent 70%)" }}
      />
      <div className="relative z-[1] flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="mb-[10px] text-[10.5px] uppercase tracking-[0.1em] text-faint"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {label}
          </p>
          <p
            className="flex items-baseline gap-2 text-[44px] font-medium leading-none text-ink tabular-nums"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            {value}
          </p>
        </div>
        <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-[3px] border-dashed border-edge text-faint">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 3 3 5-6" />
          </svg>
        </div>
      </div>
      <p className="relative z-[1] mt-3 text-[11.5px] leading-relaxed text-faint">{note}</p>
    </div>
  );
}

function MiniStat({ num, label, amber }: { num: string; label: string; amber?: boolean }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-4">
      <p
        className="text-[22px] font-medium tabular-nums"
        style={{
          fontFamily: "JetBrains Mono, monospace",
          color: amber ? "var(--dos-gold)" : "var(--dos-ink)",
        }}
      >
        {num}
      </p>
      <p className="mt-1 text-[11px] text-sub">{label}</p>
    </div>
  );
}

function IdCard({
  fullName,
  identifier,
  faculty,
  department,
  level,
  variant,
  aspirationDept,
}: {
  fullName: string;
  identifier: string;
  faculty?: string | null;
  department?: string | null;
  level?: number | null;
  variant: "student" | "aspirant";
  aspirationDept?: string | null;
}) {
  const initials = getInitials(fullName);
  return (
    <div className="flex items-center gap-[13px] rounded-[18px] border border-line bg-panel p-4">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[15px] font-semibold text-white"
        style={{ background: "linear-gradient(155deg, var(--dos-brand), var(--dos-brand-press))", fontFamily: "var(--font-fraunces), serif" }}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0">
        <p
          className="mb-[3px] text-[10px] uppercase tracking-[0.08em] text-faint"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Registered as
        </p>
        {variant === "student" ? (
          <>
            <p className="truncate text-[13px] font-semibold text-ink">
              {[faculty, department].filter(Boolean).join(" · ") || "Faculty · Department not set"}
            </p>
            <p
              className="mt-[2px] truncate text-[11.5px] text-sub"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Level {level != null ? level : "0"} · {identifier}
            </p>
          </>
        ) : (
          <>
            <p className="truncate text-[13px] font-semibold text-ink">
              Aspiring: {aspirationDept ?? "department not set"}
            </p>
            <p
              className="mt-[2px] truncate text-[11.5px] text-sub"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {identifier}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyDashed({
  headline,
  sub,
}: {
  headline: string;
  sub: string;
}) {
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

function ErrorCardDark({ message, onRetry }: { message: unknown; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[18px] border border-line bg-panel p-5"
    >
      <p className="text-sm font-medium text-ink">Dashboard data couldn&apos;t be loaded.</p>
      <p className="mt-1 break-words text-sm text-sub">
        {message instanceof ApiError ? message.message : "Check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0"
      >
        Retry
      </button>
    </div>
  );
}

function QuizListSection({
  heading,
  note,
  items,
  heldQuizIds,
  countLabel,
}: {
  heading: string;
  note?: string;
  items: ListItem[];
  heldQuizIds: Set<number>;
  countLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <section aria-label={heading} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
            {heading}
          </h2>
          {countLabel && (
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-faint"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {countLabel}
            </span>
          )}
        </div>
        {note && <p className="break-words text-sm text-sub">{note}</p>}
        <EmptyDashed headline="No quizzes in this section" sub="New quizzes will appear here once your lecturers publish them." />
      </section>
    );
  }

  return (
    <section aria-label={heading} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          {heading}
        </h2>
        <span
          className="text-[10px] uppercase tracking-[0.08em] text-faint"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {items.length} {items.length === 1 ? "quiz" : "quizzes"}
        </span>
      </div>
      {note && <p className="break-words text-sm text-sub">{note}</p>}
      <ul role="list" className="space-y-2">
        {items.map((item) => {
          const isHeld = heldQuizIds.has(item.id);
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-panel p-3 transition-colors hover:bg-line/60"
            >
              <div className="min-w-0">
                <p className="truncate break-words text-sm font-medium text-ink">{item.label}</p>
                <p className="text-sm text-sub">
                  {item.questionCount} questions
                  {item.timeLimitMinutes !== null ? ` · ${item.timeLimitMinutes} min` : ""}
                </p>
              </div>
              {isHeld ? (
                <span
                  aria-label="Score pending Board release"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-edge bg-line px-3 text-sm font-medium text-sub"
                >
                  Awaiting release
                </span>
              ) : (
                <Link
                  href={`/quizzes/${item.id}/attempt`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0"
                >
                  Start quiz
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function studentLabel(quiz: QuizRow): string {
  return quiz.weekStart !== null ? `${quiz.courseCode ?? quiz.title} — Week of ${quiz.weekStart}` : (quiz.courseCode ?? quiz.title);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAspirant = user?.role === "aspirant";

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
  });

  const quizzesQuery = useQuery({
    queryKey: ["quizzes", user?.role],
    queryFn: (): Promise<{ data: QuizRow[] }> => apiFetch<{ data: QuizRow[] }>("/quizzes"),
  });

  const attemptsQuery = useQuery({
    queryKey: ["dashboard-attempts", user?.id],
    queryFn: () => apiFetch<AttemptsResponse>("/me/attempts?page=1&pageSize=100"),
  });

  const me = meQuery.data?.data;
  const fullName = me?.fullName ?? "";
  const firstName = fullName ? firstNameOf(fullName) : "";
  const quizzes = quizzesQuery.data?.data ?? [];
  const heldQuizIds = new Set(
    (attemptsQuery.data?.data ?? [])
      .filter((a) => a.quizType === "course" && a.score === undefined)
      .map((a) => a.quizId),
  );

  const greeter = (
    <div className="space-y-0">
      <p
        className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-brand"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        Dashboard
      </p>
      <h1
        className="text-[26px] font-medium leading-[1.25] tracking-[-0.01em] text-ink"
        style={{ fontFamily: "var(--font-fraunces), serif" }}
      >
        {firstName ? (
          <>
            Assalamu alaikum, {firstName} — <em className="font-medium italic text-gold">welcome back</em>
          </>
        ) : (
          <>
            Assalamu alaikum — <em className="font-medium italic text-gold">welcome back</em>
          </>
        )}
      </h1>
      <p className="mt-[6px] max-w-[30ch] text-[13px] leading-[1.5] text-sub">
        {isAspirant ? "Your Post-UTME practice in one place." : "Your weekly practice and Course Quizzes, all in one place."}
      </p>
    </div>
  );

  if (isAspirant) {
    const profile = me?.profile && "postUtmeConverted" in me.profile ? me.profile : null;
    const toItems = (rows: QuizRow[]): ListItem[] =>
      rows.map((quiz) => ({
        id: quiz.id,
        label: quiz.subjectName ?? quiz.title,
        questionCount: quiz.questionCount,
        timeLimitMinutes: quiz.timeLimitMinutes,
      }));
    const topicItems = toItems(quizzes.filter((q) => q.quizType === "topic"));
    const courseItems = toItems(quizzes.filter((q) => q.quizType === "course"));
    const totalCount = topicItems.length + courseItems.length;

    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {greeter}

        {meQuery.isPending ? (
          <div className="space-y-3" aria-label="Loading dashboard" aria-busy="true">
            <Skeleton className="h-[86px] w-full rounded-[18px] bg-line" />
            <Skeleton className="h-[148px] w-full rounded-[22px] bg-line" />
            <div className="grid gap-[10px] sm:grid-cols-2">
              <Skeleton className="h-[78px] w-full rounded-[18px] bg-line" />
              <Skeleton className="h-[78px] w-full rounded-[18px] bg-line" />
            </div>
          </div>
        ) : meQuery.isError ? (
          <ErrorCardDark message={meQuery.error} onRetry={() => void meQuery.refetch()} />
        ) : me ? (
          <>
            <IdCard
              fullName={me.fullName}
              identifier={me.identifier}
              variant="aspirant"
              aspirationDept={profile?.aspirationDepartment ?? null}
            />
            <HeroCard
              label={
                profile?.postUtmeWeekStart ? `Post-UTME — week of ${profile.postUtmeWeekStart}` : "Post-UTME Score"
              }
              value={formatPostUtme(profile?.postUtmeRaw ?? null, profile?.postUtmeConverted ?? null)}
              note={
                profile?.postUtmeConverted == null && profile?.postUtmeRaw == null
                  ? "Your Post-UTME score is 0 / 50 — complete a Course Quiz to start building it."
                  : "Your Post-UTME score appears once your first Course Quiz score is released."
              }
            />
            <div className="grid grid-cols-2 gap-[10px]">
              <MiniStat num={String(profile?.quizzesTaken ?? 0)} label="Quizzes taken" />
              <MiniStat num="Sat" label="Next quiz window" amber />
            </div>
          </>
        ) : null}

        {quizzesQuery.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-[18px] bg-line" />
            <Skeleton className="h-24 w-full rounded-[18px] bg-line" />
          </div>
        ) : quizzesQuery.isError ? (
          <ErrorCardDark message={quizzesQuery.error} onRetry={() => void quizzesQuery.refetch()} />
        ) : quizzes.length === 0 ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
                This week
              </h2>
              <span
                className="text-[10px] uppercase tracking-[0.08em] text-faint"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                0 quizzes
              </span>
            </div>
            <EmptyDashed
              headline="No quizzes yet"
              sub="New Topic and Course Quizzes will show up here as soon as your lecturers publish them."
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
                This week
              </h2>
              <span
                className="text-[10px] uppercase tracking-[0.08em] text-faint"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {totalCount} {totalCount === 1 ? "quiz" : "quizzes"}
              </span>
            </div>
            <QuizListSection
              heading="Available Quizzes"
              note="Grouped by JAMB subject. Course Quiz scores stay hidden until the Board releases them."
              items={[...courseItems, ...topicItems]}
              heldQuizIds={new Set()}
            />
          </div>
        )}
      </div>
    );
  }

  const studentProfile = me?.profile && "cgpa" in me.profile ? me.profile : null;
  const topicQuizzes = quizzes.filter((quiz) => quiz.quizType === "topic");
  const courseQuizzes = quizzes.filter((quiz) => quiz.quizType === "course");
  const totalWeekly = topicQuizzes.length + courseQuizzes.length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {greeter}

      {meQuery.isPending ? (
        <div className="space-y-3" aria-label="Loading dashboard" aria-busy="true">
          <Skeleton className="h-[86px] w-full rounded-[18px] bg-line" />
          <Skeleton className="h-[148px] w-full rounded-[22px] bg-line" />
          <div className="grid gap-[10px] sm:grid-cols-2">
            <Skeleton className="h-[78px] w-full rounded-[18px] bg-line" />
            <Skeleton className="h-[78px] w-full rounded-[18px] bg-line" />
          </div>
          <Skeleton className="h-[44px] w-full rounded-[14px] bg-line" />
        </div>
      ) : meQuery.isError ? (
        <ErrorCardDark message={meQuery.error} onRetry={() => void meQuery.refetch()} />
      ) : me ? (
        <>
          <IdCard
            fullName={me.fullName}
            identifier={me.identifier}
            faculty={studentProfile?.faculty ?? null}
            department={studentProfile?.department ?? null}
            level={studentProfile?.level ?? null}
            variant="student"
          />
          <HeroCard
            label={studentProfile?.cgpaWeekStart ? `CGPA — week of ${studentProfile.cgpaWeekStart}` : "Cumulative GPA"}
            value={formatCgpa(studentProfile?.cgpa ?? null)}
            note={
              studentProfile?.cgpa == null
                ? "Your CGPA is 0.00 — complete a Course Quiz to start building it."
                : "Your CGPA appears once your first Course Quiz score is released."
            }
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <MiniStat num={String(studentProfile?.quizzesTaken ?? 0)} label="Quizzes taken" />
            <MiniStat num="Sat" label="Next quiz window" amber />
          </div>
          <SemesterPills activeSemester={me.activeSemester} />
        </>
      ) : null}

      {quizzesQuery.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-[18px] bg-line" />
          <Skeleton className="h-24 w-full rounded-[18px] bg-line" />
        </div>
      ) : quizzesQuery.isError ? (
        <ErrorCardDark message={quizzesQuery.error} onRetry={() => void quizzesQuery.refetch()} />
      ) : quizzes.length === 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              This week
            </h2>
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-faint"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              0 quizzes
            </span>
          </div>
          <EmptyDashed
            headline="No quizzes yet"
            sub="New Topic and Course Quizzes will show up here as soon as your lecturers publish them."
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-medium italic text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              This week
            </h2>
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-faint"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {totalWeekly} {totalWeekly === 1 ? "quiz" : "quizzes"}
            </span>
          </div>
          <QuizListSection
            heading="Topic Quizzes"
            note="Practice only — these scores don't count toward your CGPA."
            items={topicQuizzes.map((quiz) => ({ ...quiz, label: studentLabel(quiz) }))}
            heldQuizIds={heldQuizIds}
          />
          <QuizListSection
            heading="Course Quizzes"
            note="Weekly assessments — submit Sat–Sun; scores appear after the Board releases them."
            items={courseQuizzes.map((quiz) => ({ ...quiz, label: studentLabel(quiz) }))}
            heldQuizIds={heldQuizIds}
          />
        </div>
      )}
    </div>
  );
}
