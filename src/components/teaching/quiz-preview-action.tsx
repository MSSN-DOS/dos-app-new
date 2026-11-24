"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/client-fetch";
import { quizBuilderDocumentSchema } from "@/lib/validation/quiz-builder";
import { QuizPreview } from "./quiz-preview";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function QuizPreviewAction({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["quiz-preview", id],
    enabled: open,
    staleTime: 0,
    queryFn: async () =>
      quizBuilderDocumentSchema.parse(
        (await apiFetch<{ data: unknown }>(`/teacher/quizzes/${id}/builder`)).data,
      ),
  });
  return (
    <>
      <Button variant="ghost" className="min-h-11" onClick={() => setOpen(true)}>
        <Eye className="size-4" />
        View
      </Button>
      {open && query.data ? (
        <QuizPreview
          open
          onOpenChange={setOpen}
          payload={query.data}
          coverUrl={query.data.coverImageUrl}
        />
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Quiz preview</DialogTitle>
            <DialogDescription>
              {query.isError ? query.error.message : "Loading preview…"}
            </DialogDescription>
            {query.isError && (
              <Button variant="outline" onClick={() => query.refetch()}>
                Retry
              </Button>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
