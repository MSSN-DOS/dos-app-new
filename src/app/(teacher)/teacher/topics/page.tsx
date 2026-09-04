"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TopicRow {
  id: number;
  title: string;
  courseId: number;
  courseCode: string;
}

interface CourseRow {
  id: number;
  code: string;
  title: string;
}

type FormMode = { kind: "add" } | { kind: "edit"; topic: TopicRow };
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedTopics = { data: TopicRow[]; meta: PageMeta };

const PAGE_SIZE = 10;

export default function TopicsPage() {
  const queryClient = useQueryClient();

  const [courseId, setCourseId] = useState<string>("");
  const [page, setPage] = useState(1);

  const coursesQuery = useQuery({
    queryKey: ["structure", "courses"],
    queryFn: async () => {
      const res = await apiFetch<{ data: CourseRow[] }>("/structure/courses");
      return [...res.data].sort((a, b) => a.code.localeCompare(b.code));
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["teacher", "topics", courseId, page],
    queryFn: async () => {
      const res = await apiFetch<PaginatedTopics>(
        `/teacher/topics?courseId=${encodeURIComponent(courseId)}&page=${page}&pageSize=${PAGE_SIZE}`,
      );
      return { ...res, data: [...res.data].sort((a, b) => a.title.localeCompare(b.title)) };
    },
    enabled: courseId !== "",
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "add" });
  const [formTitle, setFormTitle] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TopicRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (input: { id?: number; title: string; courseId: number }) => {
      const body = JSON.stringify({ title: input.title, courseId: input.courseId });
      if (input.id === undefined) {
        return apiFetch<TopicRow>("/teacher/topics", { method: "POST", body });
      }
      return apiFetch<TopicRow>(`/teacher/topics/${input.id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "topics"] });
      setFormOpen(false);
      toast.success(formMode.kind === "add" ? "Topic created" : "Topic updated");
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save the topic. Try again.",
      );
      toast.error(err instanceof ApiError ? err.message : "Could not save the topic. Try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/teacher/topics/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "topics"] });
      setDeleteTarget(null);
      toast.success("Topic deleted");
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show why the delete was blocked.
      setActionError(
        err instanceof ApiError ? err.message : "Could not delete the topic. Try again.",
      );
      toast.error(err instanceof ApiError ? err.message : "Could not delete the topic. Try again.");
    },
  });

  const courses = coursesQuery.data ?? [];
  const courseLabel = (id: number) =>
    courses.find((c) => c.id === id)?.code ?? `#${id}`;

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setFormTitle("");
    setFormCourseId(courseId);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (topic: TopicRow) => {
    setFormMode({ kind: "edit", topic });
    setFormTitle(topic.title);
    setFormCourseId(String(topic.courseId));
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      title: formTitle,
      courseId: Number(formCourseId),
      ...(formMode.kind === "edit" ? { id: formMode.topic.id } : {}),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  const formReady = Boolean(formTitle.trim() && formCourseId);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Topics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Topics hold the questions your topic quizzes draw from. Pick a course first.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0" disabled={courseId === ""}>
          Add topic
        </Button>
      </div>

      <div className="mt-4">
        <Label htmlFor="course-select" className="sr-only">Course</Label>
        <Select value={courseId} onValueChange={(value) => { setCourseId(value); setPage(1); }}>
          <SelectTrigger id="course-select" className="w-full sm:w-80">
            <SelectValue placeholder="Select a course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.code} — {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {!coursesQuery.isPending && courseId === "" ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Pick a course above to see its topics.
            </p>
          </div>
        ) : coursesQuery.isPending || topicsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading topics">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : coursesQuery.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {coursesQuery.error instanceof ApiError
                ? coursesQuery.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void coursesQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : topicsQuery.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {topicsQuery.error instanceof ApiError
                ? topicsQuery.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void topicsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !topicsQuery.data || topicsQuery.data.data.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No topics yet for this course.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Topics">
              <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>Course</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{topicsQuery.data.data.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="text-base font-medium">{topic.title}</TableCell>
                  <TableCell>{courseLabel(topic.courseId)}</TableCell>
                  <TableCell className="text-right"><span className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="min-h-11" onClick={() => openEdit(topic)}><Pencil aria-hidden="true" />Edit</Button>
                    <Button variant="ghost" size="sm" className="min-h-11 text-destructive hover:text-destructive" onClick={() => { setActionError(null); setDeleteTarget(topic); }}><Trash2 aria-hidden="true" />Delete</Button>
                  </span></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {topicsQuery.data && topicsQuery.data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3" aria-label="Topics pagination">
          <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Previous</Button>
          <span className="text-sm text-muted-foreground">Page {topicsQuery.data.meta.page} of {topicsQuery.data.meta.totalPages}</span>
          <Button variant="outline" className="min-h-11" disabled={page >= topicsQuery.data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add" ? "Add topic" : `Edit ${formMode.topic.title}`}
            </DialogTitle>
            <DialogDescription>Topics live under exactly one course.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="topic-title">Topic title</Label>
              <Input
                id="topic-title"
                type="text"
                maxLength={200}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="topic-course">Course</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger id="topic-course" className="w-full">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending || !formReady}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deletion is blocked if any quiz or question in the bank
              still references this topic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">{actionError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
