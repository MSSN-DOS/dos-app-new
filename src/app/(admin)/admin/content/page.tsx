"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { MAX_PDF_BYTES } from "@/lib/validation/content";

interface CourseOption {
  id: number;
  code: string;
  title: string;
}
interface SubjectOption {
  id: number;
  name: string;
}
interface ContentRow {
  id: number;
  type: "pdf" | "article";
  title: string;
  courseCode: string | null;
  subjectName: string | null;
}
type ContentListResponse = { data: ContentRow[] };

const ACCEPTED_TYPES = ["application/pdf"];

export default function AdminContentPage() {
  const queryClient = useQueryClient();

  const [contentType, setContentType] = useState<"pdf" | "article">("pdf");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [track, setTrack] = useState<"course" | "subject">("course");
  const [courseId, setCourseId] = useState<string>("");
  const [jambSubjectId, setJambSubjectId] = useState<string>("");

  const listQuery = useQuery({
    queryKey: ["admin", "content"],
    queryFn: () => apiFetch<ContentListResponse>("/admin/content"),
  });

  const coursesQuery = useQuery({
    queryKey: ["structure", "courses"],
    queryFn: () => apiFetch<{ data: CourseOption[] }>("/structure/courses"),
    enabled: track === "course",
  });
  const subjectsQuery = useQuery({
    queryKey: ["jamb", "subjects"],
    queryFn: () => apiFetch<{ data: SubjectOption[] }>("/jamb/subjects"),
    enabled: track === "subject",
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (contentType === "pdf") {
        if (!file) throw new Error("Choose a PDF file first");
        if (!ACCEPTED_TYPES.includes(file.type)) {
          throw new Error("Only PDF files are allowed");
        }
        if (file.size > MAX_PDF_BYTES) {
          throw new Error(`PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB limit`);
        }
        const form = new FormData();
        form.set("title", title);
        form.set("file", file);
        if (track === "course") form.set("courseId", courseId);
        else form.set("jambSubjectId", jambSubjectId);
        return apiFetch("/admin/content", { method: "POST", body: form });
      }
      return apiFetch("/admin/content", {
        method: "POST",
        body: JSON.stringify({
          type: "article",
          title,
          body,
          ...(track === "course"
            ? { courseId: Number(courseId) }
            : { jambSubjectId: Number(jambSubjectId) }),
        }),
      });
    },
    onSuccess: () => {
      toast.success(contentType === "pdf" ? "PDF published" : "Article published");
      setTitle("");
      setBody("");
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "content"] });
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not publish. Try again.",
      );
    },
  });

  const [pendingDelete, setPendingDelete] = useState<ContentRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/content/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      toast.success("Content deleted");
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "content"] });
      void id;
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : "Could not delete. Try again.");
    },
  });

  const scopeReady =
    track === "course" ? courseId !== "" : jambSubjectId !== "";
  const publishDisabled =
    upload.isPending ||
    title.trim() === "" ||
    !scopeReady ||
    (contentType === "pdf" && file === null) ||
    (contentType === "article" && body.trim() === "");

  const rows = listQuery.data?.data ?? [];

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload PDFs or write articles for students and aspirants.
        </p>
      </div>

      <section className="mt-6 rounded-md border p-4" aria-label="Upload content">
        <Tabs
          value={contentType}
          onValueChange={(value) => setContentType(value as "pdf" | "article")}
        >
          <TabsList>
            <TabsTrigger value="pdf" className="min-h-11">
              PDF
            </TabsTrigger>
            <TabsTrigger value="article" className="min-h-11">
              Article
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="content-title">Title</Label>
            <Input
              id="content-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Week 4 Reading"
              className="min-h-11"
            />
          </div>

          {contentType === "pdf" ? (
            <div className="grid gap-2">
              <Label htmlFor="content-file">PDF file</Label>
              <Input
                id="content-file"
                type="file"
                accept=".pdf,application/pdf"
                className="min-h-11"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="content-body">Body</Label>
              <Textarea
                id="content-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                placeholder="Write the article in markdown…"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label>Scope</Label>
            <Select
              value={track}
              onValueChange={(value) => {
                setTrack(value as "course" | "subject");
                setCourseId("");
                setJambSubjectId("");
              }}
            >
              <SelectTrigger className="min-h-11 w-full sm:w-64" aria-label="Audience track">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="course">Students — by course</SelectItem>
                <SelectItem value="subject">Aspirants — by JAMB subject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {track === "course" ? (
            <div className="grid gap-2">
              <Label htmlFor="content-course">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="content-course" className="min-h-11 w-full sm:w-64">
                  <SelectValue
                    placeholder={
                      coursesQuery.isPending
                        ? "Loading courses…"
                        : coursesQuery.isError
                          ? "Could not load courses"
                          : "Pick a course"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(coursesQuery.data?.data ?? []).map((course) => (
                    <SelectItem key={course.id} value={String(course.id)}>
                      {course.code} — {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="content-subject">JAMB subject</Label>
              <Select value={jambSubjectId} onValueChange={setJambSubjectId}>
                <SelectTrigger id="content-subject" className="min-h-11 w-full sm:w-64">
                  <SelectValue
                    placeholder={
                      subjectsQuery.isPending
                        ? "Loading subjects…"
                        : subjectsQuery.isError
                          ? "Could not load subjects"
                          : "Pick a subject"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(subjectsQuery.data?.data ?? []).map((subject) => (
                    <SelectItem key={subject.id} value={String(subject.id)}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={publishDisabled}
              onClick={() => upload.mutate()}
            >
              {upload.isPending
                ? contentType === "pdf"
                  ? "Uploading…"
                  : "Publishing…"
                : "Publish"}
            </Button>
            {upload.isPending && contentType === "pdf" && (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                Uploading PDF — large files can take a moment.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8" aria-label="Existing content">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Existing content
        </h2>
        <div className="mt-3 space-y-3">
          {listQuery.isPending ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading content">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="rounded-md border p-6 text-center">
              <p role="alert" className="text-sm text-muted-foreground">
                {listQuery.error instanceof ApiError
                  ? listQuery.error.message
                  : "Something went wrong"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-11"
                onClick={() => void listQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No content posted yet. Upload a PDF or write an article above.
              </p>
            </div>
          ) : (
            <ul role="list" className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-base font-medium">{row.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {row.type === "pdf" ? "PDF" : "Article"}
                      {row.courseCode ? ` · ${row.courseCode}` : ""}
                      {row.subjectName ? ` · ${row.subjectName}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 shrink-0 self-start sm:self-auto"
                    disabled={remove.isPending}
                    onClick={() => setPendingDelete(row)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the item
              {pendingDelete?.type === "pdf" ? " and its uploaded file" : ""}. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) remove.mutate(pendingDelete.id);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
