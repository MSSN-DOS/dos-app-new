"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface StudentDetail {
  student: {
    id: number;
    fullName: string;
    identifier: string;
    isActive: boolean;
    departmentName: string;
    facultyName: string;
    levelValue: number;
  };
  currentCgpa: string | null;
  quizzesTaken: number;
  attempts: Array<{
    attemptId: number;
    quizTitle: string;
    quizType: string;
    courseCode: string | null;
    attemptNumber: number;
    score: string | null;
    submittedAt: string | null;
    releasedAt: string | null;
  }>;
  cgpaHistory: Array<{ weekStart: string; cgpaValue: string }>;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number.parseInt(params.id, 10);

  const query = useQuery({
    queryKey: ["admin", "students", id],
    queryFn: () => apiFetch<StudentDetail>(`/admin/users/students/${id}`),
    enabled: Number.isInteger(id) && id >= 1,
  });

  if (!Number.isInteger(id) || id < 1) {
    return (
      <div role="alert" className="rounded-md border p-8 text-center">
        <p className="text-sm text-muted-foreground">Invalid student id.</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading student">
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

  const { student, currentCgpa, quizzesTaken, attempts, cgpaHistory } = query.data;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11">
        <Link href="/admin/students">
          <ArrowLeft aria-hidden="true" />
          All students
        </Link>
      </Button>

      <h1 className="mt-3 break-words text-2xl font-bold">{student.fullName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {student.identifier} · {student.departmentName}, {student.facultyName} ·{" "}
        {student.levelValue}L{student.isActive ? "" : " · Inactive"}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Current CGPA</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {currentCgpa != null ? (Number(currentCgpa) > 5 ? Number(currentCgpa) / 20 : Number(currentCgpa)).toFixed(2) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Quizzes taken</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{quizzesTaken}</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
                        {a.courseCode ?? (a.quizType === "topic" ? "Topic quiz" : "Course quiz")}{" "}
                        {a.attemptNumber > 1 ? `· Attempt ${a.attemptNumber}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>{formatDate(a.submittedAt)}</TableCell>
                    <TableCell className="tabular-nums">{a.score ?? "—"}</TableCell>
                    <TableCell>{a.releasedAt ? "Released" : "Held"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="cgpa-history-heading" className="mt-6">
        <h2 id="cgpa-history-heading" className="text-lg font-semibold">Weekly CGPA history</h2>
        {cgpaHistory.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No CGPA records yet — they appear once scores are released.
          </p>
        ) : (
          <ul role="list" className="mt-3 divide-y rounded-md border">
            {cgpaHistory.map((row) => (
              <li key={row.weekStart} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{formatDate(`${row.weekStart}T00:00:00Z`)}</span>
                <span className="font-medium tabular-nums">
                  {(Number(row.cgpaValue) > 5 ? Number(row.cgpaValue) / 20 : Number(row.cgpaValue)).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
