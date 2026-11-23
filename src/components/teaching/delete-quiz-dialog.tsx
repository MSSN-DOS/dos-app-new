"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

export type DeleteQuizTarget = {
  id: number;
  title: string;
  status: "draft" | "published";
  hasAttempts?: boolean;
};

/**
 * Admin-only removal. Attempted quizzes can be archived. Published quizzes
 * without attempts require title confirmation for permanent deletion.
 */
export function DeleteQuizDialog({
  quiz,
  onOpenChange,
  onCompleted,
}: {
  quiz: DeleteQuizTarget | null;
  onOpenChange: (open: boolean) => void;
  onCompleted: (archived: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [serverWantsTitle, setServerWantsTitle] = useState(false);
  const [serverWantsArchive, setServerWantsArchive] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  if ((quiz?.id ?? null) !== seenId) {
    setSeenId(quiz?.id ?? null);
    setTyped("");
    setServerWantsTitle(false);
    setServerWantsArchive(false);
  }

  const archive = Boolean(quiz?.hasAttempts) || serverWantsArchive;
  const needsTitle = !archive && (quiz?.status === "published" || serverWantsTitle);
  const matches = quiz
    ? typed.trim().toLowerCase() === quiz.title.trim().toLowerCase()
    : false;

  const remove = useMutation({
    mutationFn: (target: DeleteQuizTarget) =>
      apiFetch<void>(`/admin/quizzes/${target.id}`, {
        method: archive ? "PATCH" : "DELETE",
        body: JSON.stringify(archive ? { action: "archive" } : needsTitle ? { title: typed.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success(archive ? "Quiz archived" : "Quiz deleted");
      onOpenChange(false);
      onCompleted(archive);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "QUIZ_HAS_ATTEMPTS") {
        setServerWantsArchive(true);
        setTyped("");
        return;
      }
      if (err instanceof ApiError && err.code === "CONFIRMATION_REQUIRED") {
        setServerWantsTitle(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not update the quiz");
    },
  });

  return (
    <Dialog
      open={quiz !== null}
      onOpenChange={(o) => !remove.isPending && onOpenChange(o)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle
            className="text-xl"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            {archive ? "Archive this quiz?" : "Delete this quiz?"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {quiz
              ? archive
                ? `“${quiz.title}” will stop accepting new attempts. Students can finish attempts already in progress. Submissions and scores are kept.`
                : `“${quiz.title}” and its questions will be removed for good. This can’t be undone.`
              : null}
          </DialogDescription>
        </DialogHeader>
        {needsTitle && quiz ? (
          <div className="space-y-2">
            <Label htmlFor="delete-quiz-title" className="text-base">
              Type the quiz title to confirm
            </Label>
            <Input
              id="delete-quiz-title"
              autoComplete="off"
              className="min-h-11 text-base"
              placeholder={quiz.title}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 text-base"
            disabled={remove.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={archive ? "default" : "destructive"}
            className="min-h-11 text-base"
            disabled={!quiz || remove.isPending || (needsTitle && (!typed.trim() || !matches))}
            onClick={() => quiz && remove.mutate(quiz)}
          >
            {archive ? <Archive className="size-4" /> : <Trash2 className="size-4" />}
            {remove.isPending ? (archive ? "Archiving…" : "Deleting…") : (archive ? "Archive quiz" : "Delete quiz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
