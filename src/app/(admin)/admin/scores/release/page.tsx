"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HeldQuizRow {
  quizId: number;
  label: string;
  /** "course" | "topic". Sent so the list can name a Topic Quiz as one. */
  quizType: string;
  /** NULL for a Topic Quiz — they are not weekly, so there is no week to file them under. */
  weekStart: string | null;
  courseCode: string | null;
  subjectName: string | null;
  heldCount: number;
}

type HeldResponse = { data: HeldQuizRow[] };

interface ReleaseResponse {
  data: {
    releasedCount: number;
    recomputed: { weekStart: string; cgpaUsers: number; postUtmeUsers: number }[];
  };
}

/**
 * The name an Admin recognises the quiz by.
 *
 * A Course Quiz is identified by its subject (or course code); a Topic Quiz has neither, and
 * labelling it "Course Quiz" — which is what falling back on the absent subject name did — would
 * tell the Admin they are looking at the wrong kind of thing. `quizType` is sent by the held-scores
 * route precisely so this distinction can be made instead of guessed.
 */
/**
 * Which kind of thing a row is, so the Admin is not left guessing.
 *
 * The quiz's own name is the heading; this is the qualifier underneath it. Two Course Quizzes in
 * the same course would otherwise render identically — "CHM101 — Course Quiz", twice — which is
 * not enough information to decide which one to release.
 */
function rowTitle(row: HeldQuizRow): string {
  const qualifier = row.subjectName ?? (row.quizType === "topic" ? "Topic Quiz" : "Course Quiz");
  return `${row.courseCode ? `${row.courseCode} — ` : ""}${qualifier}`;
}

export default function ScoreReleasePage() {
  const queryClient = useQueryClient();
  const [recentlyReleased, setRecentlyReleased] = useState<
    { quizId?: number; title: string; count: number }[]
  >([]);

  const heldQuery = useQuery({
    queryKey: ["admin", "scores", "held"],
    queryFn: () => apiFetch<HeldResponse>("/admin/scores/held"),
  });

  const allRows = useMemo(() => heldQuery.data?.data ?? [], [heldQuery.data]);
  const weeks = useMemo(
    () =>
      [...new Set(allRows.map((row) => row.weekStart))].filter(
        (week): week is string => week !== null,
      ).sort(),
    [allRows],
  );
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const activeWeek = selectedWeek ?? weeks[weeks.length - 1] ?? null;

  /**
   * Topic Quiz scores are held until released exactly like Course Quiz ones — every submission is
   * held, with no carve-out — but a Topic Quiz has no `weekStart`, so it cannot appear in the week
   * picker. It is therefore shown in its own always-visible group below, releasable one quiz at a
   * time. There is deliberately no "release all" for it: bulk release is defined by week, and
   * inventing a second bulk action for a quiz type the Board never specified would be a decision
   * rather than a fix.
   *
   * Before this, these attempts were held *forever* with no path to release them at all — the
   * endpoint would have accepted one, but the Admin could never see it to release it.
   */
  const topicRows = useMemo(
    () => allRows.filter((row) => row.weekStart === null),
    [allRows],
  );
  const visibleRows = activeWeek
    ? allRows.filter((row) => row.weekStart === activeWeek)
    : allRows.filter((row) => row.weekStart !== null);

  const recordRelease = (
    response: ReleaseResponse,
    item: { quizId?: number; title: string },
  ) => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "scores", "held"] });
    setRecentlyReleased((prev) => [{ ...item, count: response.data.releasedCount }, ...prev]);
    const recompute = response.data.recomputed[0];
    toast.success(
      `Released ${response.data.releasedCount} attempt(s)` +
        (recompute
          ? ` — CGPA updated for ${recompute.cgpaUsers} student(s), Post-UTME for ${recompute.postUtmeUsers} aspirant(s)`
          : ""),
    );
  };

  const releaseOne = useMutation({
    mutationFn: (quizId: number) =>
      apiFetch<ReleaseResponse>("/admin/scores/release", {
        method: "POST",
        body: JSON.stringify({ quizId }),
      }),
    onSuccess: (response, quizId) => {
      const row = allRows.find((item) => item.quizId === quizId);
      recordRelease(response, { quizId, title: row ? rowTitle(row) : `Quiz #${quizId}` });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : "Could not release scores. Try again.");
    },
  });

  const releaseAll = useMutation({
    mutationFn: (weekStart: string) =>
      apiFetch<ReleaseResponse>("/admin/scores/release", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      }),
    onSuccess: (response, weekStart) => {
      recordRelease(response, { title: `All quizzes in week ${weekStart}` });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : "Could not release scores. Try again.");
    },
  });

  const releasing = releaseOne.isPending || releaseAll.isPending;

  return (
    <div>
      <AdminPageHeader
        kicker="Results"
        title="Score Release"
        description="Quiz scores stay hidden until you release them. Releasing also updates CGPA and Post-UTME records."
        actions={
          <div className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="size-4 text-sub" />
            <Select
              value={activeWeek ?? ""}
              onValueChange={(value) => setSelectedWeek(value)}
              disabled={weeks.length === 0}
            >
              <SelectTrigger className="w-full min-h-11 sm:w-52" aria-label="Week">
                <SelectValue placeholder={heldQuery.isPending ? "Loading…" : "Pick a week"} />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => (
                  <SelectItem key={week} value={week}>
                    Week of {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="mt-6 space-y-3">
        {heldQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading held scores">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : heldQuery.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p role="alert" className="text-sm text-muted-foreground">
              {heldQuery.error instanceof ApiError
                ? heldQuery.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => void heldQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : visibleRows.length === 0 && topicRows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No submitted attempts are waiting for release{activeWeek ? ` in week ${activeWeek}` : ""}.
            </p>
          </div>
        ) : (
          <>
            {visibleRows.length > 0 && (
              <ul role="list" aria-label="Quizzes with held scores" className="space-y-3">
                {visibleRows.map((row) => (
                  <li
                    key={row.quizId}
                    className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-medium">{row.label}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {rowTitle(row)} · Week of {row.weekStart} ·{" "}
                        <span aria-label={`${row.heldCount} attempts held`}>
                          {row.heldCount} attempt{row.heldCount === 1 ? "" : "s"} held
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 shrink-0 self-start sm:self-auto"
                      disabled={releasing}
                      onClick={() => {
                        releaseOne.mutate(row.quizId);
                      }}
                    >
                      {releaseOne.isPending && releaseOne.variables === row.quizId
                        ? "Releasing…"
                        : "Release this quiz"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {topicRows.length > 0 && (
              <section aria-labelledby="topic-held-heading" className="space-y-3">
                <div>
                  <h2 id="topic-held-heading" className="text-base font-medium">
                    Topic Quiz scores
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Held like any other score, but not filed under a week, so there is no bulk
                    release for them. Release them one quiz at a time.
                  </p>
                </div>
                <ul role="list" aria-label="Topic Quizzes with held scores" className="space-y-3">
                  {topicRows.map((row) => (
                    <li
                      key={row.quizId}
                      className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-base font-medium">{row.label}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {rowTitle(row)} ·{" "}
                          <span aria-label={`${row.heldCount} attempts held`}>
                            {row.heldCount} attempt{row.heldCount === 1 ? "" : "s"} held
                          </span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 shrink-0 self-start sm:self-auto"
                        disabled={releasing}
                        onClick={() => {
                          releaseOne.mutate(row.quizId);
                        }}
                      >
                        {releaseOne.isPending && releaseOne.variables === row.quizId
                          ? "Releasing…"
                          : "Release this quiz"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {activeWeek && (
              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={releasing}
                onClick={() => releaseAll.mutate(activeWeek)}
              >
                {releaseAll.isPending
                  ? "Releasing…"
                  : `Release all for week of ${activeWeek}`}
              </Button>
            )}
          </>
        )}
      </div>

      {recentlyReleased.length > 0 && (
        <section className="mt-8" aria-label="Recently released">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recently released
          </h2>
          <ul role="list" className="mt-2 space-y-2">
            {recentlyReleased.slice(0, 5).map((item, index) => (
              <li key={`${item.quizId ?? "bulk"}-${index}`} className="flex items-center gap-2 text-sm">
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span>
                  {item.title} — {item.count} attempt{item.count === 1 ? "" : "s"} released
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
