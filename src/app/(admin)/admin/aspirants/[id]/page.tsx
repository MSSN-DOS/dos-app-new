"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface AspirantDetail {
  aspirant: {
    id: number;
    fullName: string;
    identifier: string;
    isActive: boolean;
    aspirationDepartment: string | null;
  };
  latestPostUtme: string | null;
  attempts: Array<{
    attemptId: number;
    quizTitle: string;
    quizType: string;
    courseCode: string | null;
    subjectName: string | null;
    attemptNumber: number;
    score: string | null;
    submittedAt: string | null;
    releasedAt: string | null;
  }>;
  postUtmeHistory: Array<{
    weekStart: string;
    rawScore: string;
    convertedScore50: string;
  }>;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AspirantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number.parseInt(params.id, 10);

  const query = useQuery({
    queryKey: ["admin", "aspirants", id],
    queryFn: () => apiFetch<AspirantDetail>(`/admin/users/aspirants/${id}`),
    enabled: Number.isInteger(id) && id >= 1,
  });

  if (!Number.isInteger(id) || id < 1) {
    return (
      <div role="alert" className="rounded-md border p-8 text-center">
        <p className="text-sm text-muted-foreground">Invalid aspirant id.</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading aspirant">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div role="alert" className="rounded-md border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {query.error instanceof ApiError ? query.error.message : "Something went wrong"}
        </p>
        <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { aspirant, latestPostUtme, attempts, postUtmeHistory } = query.data;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11">
        <Link href="/admin/aspirants">
          <ArrowLeft aria-hidden="true" />
          All aspirants
        </Link>
      </Button>

      <h1 className="mt-3 break-words text-2xl font-bold">{aspirant.fullName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {aspirant.identifier}
        {aspirant.aspirationDepartment ? ` · Aspiring: ${aspirant.aspirationDepartment}` : ""}
        {aspirant.isActive ? "" : " · Inactive"}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Latest Post-UTME (converted /50)</p>
          <CardTitle className="text-3xl tabular-nums">{latestPostUtme ?? "—"}</CardTitle>
        </CardHeader>
      </Card>

      <section aria-labelledby="post-utme-history-heading" className="mt-6">
        <h2 id="post-utme-history-heading" className="text-lg font-semibold">Weekly Post-UTME history</h2>
        {postUtmeHistory.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No Post-UTME records yet — they appear once scores are released.
          </p>
        ) : (
          <ul role="list" className="mt-3 divide-y rounded-md border">
            {postUtmeHistory.map((row) => (
              <li key={row.weekStart} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm">{formatDate(row.weekStart)}</span>
                <span className="tabular-nums">
                  Raw <strong>{row.rawScore}</strong> · Converted{" "}
                  <strong>{row.convertedScore50}</strong>/50
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="attempt-history-heading" className="mt-6">
        <h2 id="attempt-history-heading" className="text-lg font-semibold">Quiz attempt history</h2>
        {attempts.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No quiz attempts yet.
          </p>
        ) : (
          <div className="mt-3 rounded-md border">
            <Table aria-label="Quiz attempt history">
              <TableHeader>
                <TableRow>
                  <TableHead>Quiz</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.attemptId}>
                    <TableCell>
                      <p className="font-medium">{a.quizTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.subjectName ?? a.courseCode ?? (a.quizType === "topic" ? "Topic quiz" : "Course quiz")}{" "}
                        {a.attemptNumber > 1 ? `· Attempt ${a.attemptNumber}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      {a.submittedAt
                        ? new Date(a.submittedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{a.score ?? "—"}</TableCell>
                    <TableCell>{a.releasedAt ? "Released" : "Held"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
