"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

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

function EmptyDashed({ text }: { text: string }) {
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
      <p className="mb-1 text-[14.5px] text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
        No resources yet
      </p>
      <p className="mx-auto max-w-[32ch] break-words text-[12px] leading-[1.55] text-sub">{text}</p>
    </div>
  );
}

export default function ResourcesPage() {
  const { user } = useAuth();
  const isAspirant = user?.role === "aspirant";

  const [courseId, setCourseId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");

  const resourcesQuery = useQuery({
    queryKey: ["resources", { track: isAspirant ? "aspirant" : "student", courseId, subjectId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isAspirant && subjectId !== "all") params.set("jambSubjectId", subjectId);
      if (!isAspirant && courseId !== "all") params.set("courseId", courseId);
      const qs = params.toString();
      return apiFetch<ResourcesResponse>(`/resources${qs ? `?${qs}` : ""}`);
    },
  });

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
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.01em] text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
            Resources
          </h1>
          <p className="mt-1 break-words text-[13px] leading-relaxed text-sub">
            Board-published reading for {isAspirant ? "your JAMB subjects" : "your courses"} — PDFs and articles.
          </p>
        </div>
        <div className="w-full sm:w-64">
          {isAspirant ? (
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger
                className="min-h-11 w-full rounded-md border-line bg-panel text-ink data-[placeholder]:text-faint focus:ring-brand"
                aria-label="JAMB subject filter"
              >
                <SelectValue placeholder={subjectsQuery.isPending ? "Loading…" : "All subjects"} />
              </SelectTrigger>
              <SelectContent className="border-line bg-panel text-ink">
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
              <SelectTrigger
                className="min-h-11 w-full rounded-md border-line bg-panel text-ink data-[placeholder]:text-faint focus:ring-brand"
                aria-label="Course filter"
              >
                <SelectValue placeholder={coursesQuery.isPending ? "Loading…" : "All courses"} />
              </SelectTrigger>
              <SelectContent className="border-line bg-panel text-ink">
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
              <Skeleton key={i} className="h-16 w-full rounded-[18px] bg-line" />
            ))}
          </div>
        ) : resourcesQuery.isError ? (
          <div className="rounded-[18px] border border-line bg-panel p-6 text-center">
            <p role="alert" className="break-words text-sm text-sub">
              {resourcesQuery.error instanceof ApiError
                ? resourcesQuery.error.message
                : "Resources couldn't be loaded. Check your connection and try again."}
            </p>
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => void resourcesQuery.refetch()}
            >
              Retry loading resources
            </button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyDashed
            text={`No resources posted yet for your ${isAspirant ? "subjects" : "courses"}. Check back — the Board publishes materials per course/subject.`}
          />
        ) : (
          <ul role="list" className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-[18px] border border-line bg-panel p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-[15px] font-medium leading-snug text-ink">{row.title}</p>
                    <p className="mt-0.5 text-[12px] text-sub">
                      {row.courseCode ?? row.subjectName} · {row.type === "pdf" ? "PDF" : "Article"}
                    </p>
                  </div>
                  {row.type === "pdf" ? (
                    row.fileUrl ? (
                      <a
                        href={row.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0 sm:self-auto"
                      >
                        Download PDF
                      </a>
                    ) : (
                      <span className="self-start text-sm text-ruby sm:self-auto">File unavailable</span>
                    )
                  ) : null}
                </div>
                {row.type === "article" && (
                  <details className="mt-2 min-w-0 rounded-md border border-line bg-canvas/50">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-ink hover:bg-line/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      Read article
                    </summary>
                    <div className="whitespace-pre-wrap border-t border-line p-3 text-[15px] leading-relaxed text-ink">
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
