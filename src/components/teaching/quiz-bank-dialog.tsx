"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/client-fetch";
import type { BuilderPassage, BuilderQuestion } from "@/lib/quizzes/builder";
import { bankCopyResultSchema } from "@/lib/validation/question-bank";
export function QuizBankDialog({
  open,
  onOpenChange,
  courseId,
  jambSubjectId,
  quizId,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: number | null;
  jambSubjectId: number | null;
  quizId: number;
  onAdd: (questions: BuilderQuestion[], passages: BuilderPassage[]) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["quiz-bank", courseId, jambSubjectId, search],
    enabled: open,
    queryFn: () => {
      const params = new URLSearchParams({
        status: "published",
        pageSize: "100",
        search,
        groupPassages: "1",
      });
      if (courseId) params.set("courseId", String(courseId));
      if (jambSubjectId) params.set("jambSubjectId", String(jambSubjectId));
      return apiFetch<{ data: { id: number; bodyRichText: string }[] }>(
        `/teacher/questions?${params}`,
      ).then((r) => r.data);
    },
  });
  const mutation = useMutation({
    mutationFn: async (id: number) => {
      const raw = await apiFetch<{ data: unknown }>(
        `/teacher/quizzes/${quizId}/bank-copy`,
        { method: "POST", body: JSON.stringify({ questionId: id }) },
      );
      const copied = bankCopyResultSchema.parse(raw.data);
      onAdd(
        copied.questions.map((q, i) => ({ ...q, clientKey: q.clientKey ?? `copy-${i}` })),
        copied.passages,
      );
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 left-0 right-0 top-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-y-auto rounded-b-none rounded-t-2xl border-line bg-panel pb-[calc(1rem+env(safe-area-inset-bottom))] text-ink sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="pr-12 text-left">
          <DialogTitle className="text-xl font-semibold">
            Add from question bank
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-sub">
            Add a copy to this quiz, then edit its marks and content.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close question bank"
            className="absolute right-2 top-2 size-11"
          >
            <X className="size-5" />
          </Button>
        </DialogClose>
        <Input
          aria-label="Search bank questions"
          className="min-h-11 text-base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions"
        />
        {query.isPending ? (
          <p className="text-base text-sub">Loading questions…</p>
        ) : query.isError ? (
          <div role="alert">
            <p className="text-base text-ruby">{query.error.message}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : query.data.length === 0 ? (
          <p className="text-base text-sub">
            No published questions match this subject and search.
          </p>
        ) : (
          <ul className="space-y-3">
            {query.data.map((q) => (
              <li
                key={q.id}
                className="flex items-center gap-3 rounded-xl border border-line p-3"
              >
                <p className="min-w-0 flex-1 break-words text-base">
                  {q.bodyRichText.replace(/<[^>]*>/g, " ").slice(0, 200)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 min-w-11 text-base"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(q.id)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        {mutation.isError && (
          <p role="alert" className="text-base text-ruby">
            {mutation.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
