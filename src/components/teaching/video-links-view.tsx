"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Play, Plus, SearchX, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
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
import { PROVIDER_LABEL, parseVideoLink } from "@/lib/content/video-link";
import type { VideoProvider } from "@/lib/content/video-link";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";
import { useAuthoringSubjects } from "@/components/teaching/use-authoring-subjects";

type VideoLinkRow = {
  id: number;
  title: string;
  url: string;
  provider: VideoProvider;
  watchUrl: string;
  embedUrl: string | null;
  courseId: number | null;
  jambSubjectId: number | null;
  courseCode: string | null;
  subjectName: string | null;
};

// Shared by /teacher/resources and (later) any admin-shell twin — the API is role-guarded
// admin+teacher, so the same UI serves both shells.
export function VideoLinksView() {
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [track, setTrack] = useState<"course" | "jamb">("course");
  const [formCourseId, setFormCourseId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<VideoLinkRow | null>(null);

  const linksQuery = useQuery({
    queryKey: ["teacher", "resources"],
    queryFn: () =>
      apiFetch<{ data: VideoLinkRow[] }>("/teacher/resources").then((r) => r.data ?? []),
  });

  const { courses, jambSubjects: subjects } = useAuthoringSubjects();

  function resetForm() {
    setEditingId(null);
    setFormTitle("");
    setFormUrl("");
    setTrack("course");
    setFormCourseId("");
    setFormSubjectId("");
    setFormError("");
  }

  function openCreate() {
    resetForm();
    setEditorOpen(true);
  }

  function openEdit(row: VideoLinkRow) {
    resetForm();
    setEditingId(row.id);
    setFormTitle(row.title);
    setFormUrl(row.url);
    if (row.jambSubjectId !== null) {
      setTrack("jamb");
      setFormSubjectId(String(row.jambSubjectId));
    } else {
      setTrack("course");
      setFormCourseId(row.courseId === null ? "" : String(row.courseId));
    }
    setEditorOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseVideoLink(formUrl);
      if (!parsed.ok) throw new ApiError(parsed.message, 422);
      if (editingId !== null) {
        return apiFetch(`/teacher/resources/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: formTitle, url: formUrl }),
        });
      }
      if (track === "course" && formCourseId === "") {
        throw new ApiError("Pick a course for this video.", 422);
      }
      if (track === "jamb" && formSubjectId === "") {
        throw new ApiError("Pick a JAMB subject for this video.", 422);
      }
      return apiFetch("/teacher/resources", {
        method: "POST",
        body: JSON.stringify({
          type: "video",
          title: formTitle,
          url: formUrl,
          ...(track === "course"
            ? { courseId: Number(formCourseId) }
            : { jambSubjectId: Number(formSubjectId) }),
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "resources"] });
      toast.success(editingId === null ? "Video link added" : "Video link updated");
      setEditorOpen(false);
      resetForm();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/teacher/resources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "resources"] });
      toast.success("Video link removed");
      setPendingDelete(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not remove the link");
      setPendingDelete(null);
    },
  });

  const rows = linksQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p
            className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-brand"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Teacher
          </p>
          <h1
            className="text-[26px] font-medium leading-[1.25] tracking-[-0.01em] text-ink"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Video links
          </h1>
          <p className="mt-[6px] max-w-[46ch] text-[13px] leading-[1.5] text-sub">
            Point students at a recorded lecture on Google Drive, YouTube or Telegram. They
            appear on Resources under the course or subject you pick.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="min-h-11 shrink-0 rounded-xl bg-brand text-white hover:bg-brand-hover"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add video link
        </Button>
      </div>

      <p className="rounded-[14px] border border-line bg-panel px-4 py-3 text-[12px] leading-relaxed text-sub">
        <strong className="font-semibold text-ink">Before you share a Drive file:</strong> set
        its sharing to <em>Anyone with the link</em>. Otherwise students see a
        &ldquo;Request access&rdquo; screen instead of the video.
      </p>

      {linksQuery.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading video links">
          <Skeleton className="h-[84px] w-full rounded-[18px] bg-line" />
          <Skeleton className="h-[84px] w-full rounded-[18px] bg-line" />
        </div>
      ) : linksQuery.isError ? (
        <div role="alert" className="rounded-[18px] border border-line bg-panel p-5">
          <p className="text-sm font-medium text-ink">Video links couldn&apos;t be loaded.</p>
          <p className="mt-1 break-words text-sm text-sub">
            {linksQuery.error instanceof ApiError
              ? linksQuery.error.message
              : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => void linksQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-edge bg-line px-4 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-edge bg-transparent px-5 py-[30px] text-center">
          <div className="mx-auto mb-[14px] flex size-[46px] items-center justify-center rounded-full bg-gold/13">
            <SearchX className="size-5 text-gold" aria-hidden="true" />
          </div>
          <p
            className="mb-[5px] text-[14.5px] text-ink"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            No video links yet
          </p>
          <p className="mx-auto max-w-[34ch] text-[12px] leading-[1.55] text-sub">
            Add a link to a recorded lecture and it shows up on Resources straight away.
          </p>
        </div>
      ) : (
        <ul role="list" className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-[18px] border border-line bg-panel p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">{row.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sub">
                    <span className="inline-flex rounded-full bg-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sub">
                      {PROVIDER_LABEL[row.provider]}
                    </span>
                    <span>{row.courseCode ?? row.subjectName ?? "—"}</span>
                    {row.embedUrl === null ? (
                      <span className="text-faint">opens in a new tab</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-faint">
                        <Play className="size-3" aria-hidden="true" />
                        plays in the portal
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={row.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[11px] border border-edge bg-line px-3 text-sm font-medium text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open
                  </a>
                  <button
                    type="button"
                    aria-label={`Edit ${row.title}`}
                    onClick={() => openEdit(row)}
                    className="inline-flex size-11 items-center justify-center rounded-[11px] border border-edge bg-line text-ink hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.title}`}
                    onClick={() => setPendingDelete(row)}
                    className="inline-flex size-11 items-center justify-center rounded-[11px] border border-edge bg-line text-ruby hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="border-line bg-panel text-ink sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-bold text-ink"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              {editingId === null ? "Add video link" : "Edit video link"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="video-title" className="text-sm font-medium text-ink">
                Title
              </Label>
              <Input
                id="video-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Limits and Continuity"
                className="mt-2 min-h-11 border-line bg-canvas"
              />
            </div>

            <div>
              <Label htmlFor="video-url" className="text-sm font-medium text-ink">
                Video link
              </Label>
              <Input
                id="video-url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/…/view"
                inputMode="url"
                className="mt-2 min-h-11 border-line bg-canvas"
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
                Paste the link you copied from Google Drive. We&apos;ll make it playable in the
                portal automatically.
              </p>
            </div>

            {editingId === null ? (
              <>
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Who is it for?</legend>
                  <div className="mt-2 flex gap-2">
                    {(["course", "jamb"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={track === option}
                        onClick={() => setTrack(option)}
                        className={
                          track === option
                            ? "min-h-11 flex-1 rounded-xl bg-brand px-3 text-sm font-semibold text-white"
                            : "min-h-11 flex-1 rounded-xl border border-edge bg-line px-3 text-sm font-medium text-sub hover:bg-edge"
                        }
                      >
                        {option === "course" ? "Students (course)" : "Aspirants (subject)"}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {track === "course" ? (
                  <div>
                    <Label htmlFor="video-course" className="text-sm font-medium text-ink">
                      Course
                    </Label>
                    <Select value={formCourseId} onValueChange={setFormCourseId}>
                      <SelectTrigger id="video-course" className="mt-2 min-h-11 w-full border-line bg-canvas">
                        <SelectValue placeholder="Pick a course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={String(course.id)}>
                            {course.code} — {course.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="video-subject" className="text-sm font-medium text-ink">
                      JAMB subject
                    </Label>
                    <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                      <SelectTrigger id="video-subject" className="mt-2 min-h-11 w-full border-line bg-canvas">
                        <SelectValue placeholder="Pick a subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={String(subject.id)}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-faint">
                The course or subject can&apos;t be changed here — remove the link and add it
                again to move it.
              </p>
            )}

            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              className="min-h-11 rounded-xl border-line bg-panel text-ink"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setFormError("");
                saveMutation.mutate();
              }}
              disabled={
                saveMutation.isPending || formTitle.trim() === "" || formUrl.trim() === ""
              }
              className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40"
            >
              {saveMutation.isPending ? "Saving…" : "Save link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="border-line bg-panel text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle
              className="text-lg font-bold text-ink"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              Remove this video link?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-sub">
              {pendingDelete?.title} will disappear from Resources immediately. You can add it
              again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-11 rounded-xl border-line bg-line text-ink">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="min-h-11 rounded-xl bg-ruby text-white hover:bg-ruby/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
