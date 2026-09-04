"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface ResourceRow {
  id: number;
  type: "pdf" | "article";
  title: string;
  createdAt: string;
  courseCode?: string;
  subjectName?: string;
  fileUrl?: string | null;
  body?: string;
}
type ResourcesResponse = { data: ResourceRow[] };

interface CourseOption {
  id: number;
  code: string;
  title: string;
}
interface SubjectOption {
  id: number;
  name: string;
}

export default function ResourcesPage() {
  const { user } = useAuth();
  const isAspirant = user?.role === "aspirant";

  const [courseId, setCourseId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");

  const resourcesQuery = useQuery({
    queryKey: [
      "resources",
      { track: isAspirant ? "aspirant" : "student", courseId, subjectId },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isAspirant && subjectId !== "all") params.set("jambSubjectId", subjectId);
      if (!isAspirant && courseId !== "all") params.set("courseId", courseId);
      const qs = params.toString();
      return apiFetch<ResourcesResponse>(`/resources${qs ? `?${qs}` : ""}`);
    },
  });

  // Filter options come from the same read-only structure endpoints used by
  // onboarding; failures degrade to an unfiltered list.
  const coursesQuery = useQuery({
    queryKey: ["structure", "courses"],
    queryFn: () => apiFetch<{ data: CourseOption[] }>("/structure/courses"),
    enabled: !isAspirant,
  });
  const subjectsQuery = useQuery({
    queryKey: ["jamb", "subjects"],
    queryFn: () => apiFetch<{ data: SubjectOption[] }>("/jamb/subjects"),
    enabled: isAspirant,
  });

  const rows = resourcesQuery.data?.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reading materials posted for{" "}
            {isAspirant ? "your JAMB subjects" : "your courses"}.
          </p>
        </div>
        <div className="w-full sm:w-64">
          {isAspirant ? (
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="min-h-11 w-full" aria-label="JAMB subject filter">
                <SelectValue
                  placeholder={subjectsQuery.isPending ? "Loading…" : "All subjects"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {(subjectsQuery.data?.data ?? []).map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="min-h-11 w-full" aria-label="Course filter">
                <SelectValue
                  placeholder={coursesQuery.isPending ? "Loading…" : "All courses"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {(coursesQuery.data?.data ?? []).map((course) => (
                  <SelectItem key={course.id} value={String(course.id)}>
                    {course.code} — {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {resourcesQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading resources">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : resourcesQuery.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p role="alert" className="text-sm text-muted-foreground">
              {resourcesQuery.error instanceof ApiError
                ? resourcesQuery.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => void resourcesQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No resources posted yet for your {isAspirant ? "subjects" : "courses"}.
            </p>
          </div>
        ) : (
          <ul role="list" className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-base font-medium">{row.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {row.courseCode ?? row.subjectName} ·{" "}
                      {row.type === "pdf" ? "PDF" : "Article"}
                    </p>
                  </div>
                  {row.type === "pdf" ? (
                    row.fileUrl ? (
                      <Button
                        asChild
                        size="sm"
                        className="min-h-11 shrink-0 self-start sm:self-auto"
                      >
                        <a href={row.fileUrl} target="_blank" rel="noopener noreferrer">
                          Download
                        </a>
                      </Button>
                    ) : (
                      <span className="self-start text-sm text-destructive sm:self-auto">
                        File unavailable
                      </span>
                    )
                  ) : null}
                </div>
                {row.type === "article" && (
                  <details className="mt-2 min-w-0">
                    <summary className="min-h-11 cursor-pointer text-sm font-medium leading-[2.75rem] sm:leading-normal">
                      Read
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-base">
                      {row.body ?? ""}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
