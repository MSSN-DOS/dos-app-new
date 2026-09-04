"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function SemesterPills({
  activeSemester,
}: {
  activeSemester: "harmattan" | "rain" | null;
}) {
  return (
    <div className="flex gap-2">
      {(["harmattan", "rain"] as const).map((semester) => (
        <span
          key={semester}
          className={
            semester === activeSemester
              ? "inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium capitalize text-primary-foreground"
              : "inline-flex min-h-11 items-center rounded-md bg-muted px-3 text-sm font-medium capitalize text-muted-foreground"
          }
        >
          {semester}
        </span>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function QuizListSection({
  heading,
  note,
  items,
  heldQuizIds,
}: {
  heading: string;
  note?: string;
  items: ListItem[];
  heldQuizIds: Set<number>;
}) {
  if (items.length === 0) {
    return (
      <section aria-label={heading}>
        <h2 className="text-lg font-semibold">{heading}</h2>
        {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
        <Card className="mt-3">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No quizzes here right now.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={heading}>
      <h2 className="text-lg font-semibold">{heading}</h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <ul role="list" className="mt-3 space-y-2">
        {items.map((item) => {
          const isHeld = heldQuizIds.has(item.id);

          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">
                  {item.questionCount} questions
                  {item.timeLimitMinutes !== null &&
                    ` · ${item.timeLimitMinutes} min`}
                </p>
              </div>
              {isHeld ? (
                <span
                  aria-label="Score pending release"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground"
                >
                  Score pending
                </span>
              ) : (
                <Link
                  href={`/quizzes/${item.id}/attempt`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Open
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
  return quiz.weekStart !== null
    ? `${quiz.courseCode ?? quiz.title} — Week of ${quiz.weekStart}`
    : (quiz.courseCode ?? quiz.title);
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: unknown;
  onRetry: () => void;
}) {
  return (
    <Card role="alert">
      <CardContent className="space-y-3 pt-6">
        <p>Content could not be loaded.</p>
        <p className="text-sm text-muted-foreground">
          {message instanceof ApiError ? message.message : "Try again."}
        </p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
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
    queryFn: (): Promise<{ data: QuizRow[] }> =>
      apiFetch<{ data: QuizRow[] }>("/quizzes"),
  });

  const attemptsQuery = useQuery({
    queryKey: ["dashboard-attempts", user?.id],
    queryFn: () =>
      apiFetch<AttemptsResponse>("/me/attempts?page=1&pageSize=100"),
  });

  if (isAspirant) {
    const me = meQuery.data?.data;
    const profile =
      me?.profile && "postUtmeConverted" in me.profile ? me.profile : null;

    const quizzes = quizzesQuery.data?.data ?? [];
    const toItems = (rows: QuizRow[]): ListItem[] =>
      rows.map((quiz) => ({
        id: quiz.id,
        label: quiz.subjectName ?? quiz.title,
        questionCount: quiz.questionCount,
        timeLimitMinutes: quiz.timeLimitMinutes,
      }));
    const topicItems = toItems(quizzes.filter((q) => q.quizType === "topic"));
    const courseItems = toItems(quizzes.filter((q) => q.quizType === "course"));

    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Your Post-UTME practice in one place.
          </p>
        </div>

        {meQuery.isPending && (
          <div className="space-y-3" aria-label="Loading dashboard" aria-busy="true">
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {meQuery.isError && (
          <ErrorCard message={meQuery.error} onRetry={() => void meQuery.refetch()} />
        )}

        {meQuery.isSuccess && me && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label={profile?.postUtmeWeekStart
                  ? `Post-UTME — week of ${profile.postUtmeWeekStart}`
                  : "Post-UTME score"}
                value={
                  profile?.postUtmeConverted != null
                    ? `${profile.postUtmeConverted}/100`
                    : "—"
                }
              />
              <StatCard
                label="Quizzes taken"
                value={String(profile?.quizzesTaken ?? 0)}
              />
            </div>

            <Card>
              <CardContent className="space-y-1 pt-6">
                <h2 className="font-semibold">Registered as</h2>
                <p className="text-sm text-muted-foreground">
                  {me.identifier} · {me.fullName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Aspiring: {profile?.aspirationDepartment ?? "department not set"}
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {quizzesQuery.isPending && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {quizzesQuery.isError && (
          <ErrorCard
            message={quizzesQuery.error}
            onRetry={() => void quizzesQuery.refetch()}
          />
        )}

        {quizzesQuery.isSuccess && quizzes.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">No quizzes available right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New quizzes appear here once they are published.
              </p>
            </CardContent>
          </Card>
        )}

        {quizzes.length > 0 && (
          <QuizListSection
            heading="Available Quizzes"
            note="By JAMB subject. Scores stay hidden until the Board releases them."
            items={[...courseItems, ...topicItems]}
            heldQuizIds={new Set()}
          />
        )}
      </div>
    );
  }

  const me = meQuery.data?.data;
  const studentProfile =
    me?.profile && "cgpa" in me.profile ? me.profile : null;

  const quizzes = quizzesQuery.data?.data ?? [];
  const topicQuizzes = quizzes.filter((quiz) => quiz.quizType === "topic");
  const courseQuizzes = quizzes.filter((quiz) => quiz.quizType === "course");

  const heldQuizIds = new Set(
    (attemptsQuery.data?.data ?? [])
      .filter((a) => a.quizType === "course" && a.score === undefined)
      .map((a) => a.quizId),
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Your weekly practice and Course Quizzes in one place.
        </p>
      </div>

      {meQuery.isPending && (
        <div className="space-y-3" aria-label="Loading dashboard" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {meQuery.isError && (
        <ErrorCard message={meQuery.error} onRetry={() => void meQuery.refetch()} />
      )}

      {meQuery.isSuccess && me && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label={studentProfile?.cgpaWeekStart
                ? `CGPA — week of ${studentProfile.cgpaWeekStart}`
                : "CGPA"}
              value={
                studentProfile?.cgpa != null
                  ? (Number(studentProfile.cgpa) > 5 ? Number(studentProfile.cgpa) / 20 : Number(studentProfile.cgpa)).toFixed(2)
                  : "—"
              }
            />
            <StatCard
              label="Quizzes taken"
              value={String(studentProfile?.quizzesTaken ?? 0)}
            />
          </div>

          <Card>
            <CardContent className="space-y-1 pt-6">
              <h2 className="font-semibold">Registered as</h2>
              <p className="text-sm text-muted-foreground">
                {[studentProfile?.faculty, studentProfile?.department]
                  .filter(Boolean)
                  .join(" · ") || "Faculty and department not set"}
              </p>
              <p className="text-sm text-muted-foreground">
                Level{" "}
                {studentProfile?.level != null ? studentProfile.level : "—"} ·{" "}
                {me.identifier}
              </p>
            </CardContent>
          </Card>

          <SemesterPills activeSemester={me.activeSemester} />
        </>
      )}

      {quizzesQuery.isPending && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {quizzesQuery.isError && (
        <ErrorCard
          message={quizzesQuery.error}
          onRetry={() => void quizzesQuery.refetch()}
        />
      )}

      {quizzesQuery.isSuccess && quizzes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No quizzes available this week.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              New quizzes appear here once your lecturers publish them.
            </p>
          </CardContent>
        </Card>
      )}

      {quizzes.length > 0 && (
        <div className="space-y-6">
          <QuizListSection
            heading="Topic Quizzes"
            note="Practice — doesn't count toward your CGPA."
            items={topicQuizzes.map((quiz) => ({
              ...quiz,
              label: studentLabel(quiz),
            }))}
            heldQuizIds={heldQuizIds}
          />
          <QuizListSection
            heading="Course Quizzes"
            note="Weekly assessments — scores are released by the Board."
            items={courseQuizzes.map((quiz) => ({
              ...quiz,
              label: studentLabel(quiz),
            }))}
            heldQuizIds={heldQuizIds}
          />
        </div>
      )}
    </div>
  );
}
