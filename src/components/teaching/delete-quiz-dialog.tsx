"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
};

/**
 * Admin-only. A draft deletes in one tap unless the server reports it has attempts; a published
 * quiz (or one with attempts) needs its title typed, because students' attempts and scores go too.
 */
export function DeleteQuizDialog({
  quiz,
  onOpenChange,
  onDeleted,
}: {
  quiz: DeleteQuizTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [serverWantsTitle, setServerWantsTitle] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  if ((quiz?.id ?? null) !== seenId) {
    setSeenId(quiz?.id ?? null);
    setTyped("");
    setServerWantsTitle(false);
  }

  const needsTitle = quiz ? quiz.status === "published" || serverWantsTitle : false;
  const matches = quiz
    ? typed.trim().toLowerCase() === quiz.title.trim().toLowerCase()
    : false;

  const remove = useMutation({
    mutationFn: (target: DeleteQuizTarget) =>
      apiFetch<void>(`/admin/quizzes/${target.id}`, {
        method: "DELETE",
        body: JSON.stringify(needsTitle ? { title: typed.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
      toast.success("Quiz deleted");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CONFIRMATION_REQUIRED") {
        setServerWantsTitle(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not delete the quiz");
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
            Delete this quiz?
          </DialogTitle>
          <DialogDescription className="text-base">
            {quiz
              ? needsTitle
                ? `“${quiz.title}” will be removed for good, along with every student attempt and score on it. Weekly CGPA and Post-UTME totals for those students are recalculated without it. This can’t be undone.`
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
            variant="destructive"
            className="min-h-11 text-base"
            disabled={!quiz || remove.isPending || (needsTitle && !matches)}
            onClick={() => quiz && remove.mutate(quiz)}
          >
            <Trash2 className="size-4" />
            {remove.isPending ? "Deleting…" : "Delete quiz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
