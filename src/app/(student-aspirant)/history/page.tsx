"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const context = attempt.quizType === "topic"
    ? attempt.topicTitle ?? "Topic practice"
    : attempt.courseCode ?? "Course Quiz";

  return (
    <TableRow>
      <TableCell className="min-w-52 whitespace-normal">
        <p className="font-medium">{attempt.title}</p>
        <p className="text-sm text-muted-foreground">
          {context} · Attempt {attempt.attemptNumber}
        </p>
      </TableCell>
      <TableCell>
        <p>{attempt.quizType === "course" ? "Course Quiz" : "Topic Quiz"}</p>
        {attempt.weekStart && (
          <p className="text-sm text-muted-foreground">Week of {attempt.weekStart}</p>
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        <p>{formatDate(attempt.attemptedAt)}</p>
        {!isHeld && attempt.bestScore !== undefined && (
          <p className="text-sm text-muted-foreground">Best: {attempt.bestScore}%</p>
        )}
      </TableCell>
      <TableCell>
        <span
          className={isHeld
            ? "inline-flex min-h-11 items-center rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground"
            : "inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"}
          aria-label={isHeld ? "Score pending release" : `Score ${attempt.score}%`}
        >
          {isHeld ? "Score pending" : `${attempt.score}%`}
        </span>
      </TableCell>
    </TableRow>
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
  const filterOptions = isAspirant
    ? attemptsQuery.data?.filters.jambSubjects ?? []
    : attemptsQuery.data?.filters.courses ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Progress log</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Review completed practice and course attempts. Course Quiz scores stay hidden until released.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={type} onValueChange={(value) => { setType(value); setFilterId("all"); setPage(1); }}>
          <SelectTrigger className="min-h-11 w-full" aria-label="Filter by quiz type">
            <SelectValue placeholder="All quiz types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All quiz types</SelectItem>
            <SelectItem value="course">Course Quizzes</SelectItem>
            <SelectItem value="topic">Topic Quizzes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterId} onValueChange={(value) => { setFilterId(value); setPage(1); }}>
          <SelectTrigger className="min-h-11 w-full" aria-label={isAspirant ? "Filter by JAMB subject" : "Filter by course"}>
            <SelectValue placeholder={isAspirant ? "All JAMB subjects" : "All courses"} />
          </SelectTrigger>
          <SelectContent>
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
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}

      {attemptsQuery.isError && (
        <Card role="alert">
          <CardContent className="space-y-3 pt-6">
            <p>History could not be loaded.</p>
            <p className="text-sm text-muted-foreground">
              {attemptsQuery.error instanceof ApiError ? attemptsQuery.error.message : "Try again."}
            </p>
            <Button type="button" variant="outline" onClick={() => void attemptsQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {attemptsQuery.isSuccess && attempts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No attempts match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Completed quizzes will appear here.</p>
          </CardContent>
        </Card>
      )}

      {attempts.length > 0 && (
        <div className="rounded-md border" aria-label="Quiz attempt history">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quiz</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} />)}
            </TableBody>
          </Table>
          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={page === 1 || attemptsQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={page >= meta.totalPages || attemptsQuery.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
