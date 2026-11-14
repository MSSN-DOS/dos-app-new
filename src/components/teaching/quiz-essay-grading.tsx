"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/auth/client-fetch";
import { manualQuizGradeSchema } from "@/lib/validation/quiz-builder";
import { QuizRichText } from "./quiz-student-view";
type PendingEssayAttempt = {
  id: number;
  studentName: string;
  attemptNumber: number;
  essays: {
    id: number;
    bodyRichText: string;
    marks: number;
    answer: string;
    awardedMarks: number | null;
  }[];
};
function EssayAttempt({
  attempt,
  quizId,
}: {
  attempt: PendingEssayAttempt;
  quizId: number;
}) {
  const client = useQueryClient();
  const [marks, setMarks] = useState<Record<number, string>>(
    Object.fromEntries(
      attempt.essays.map((q) => [
        q.id,
        q.awardedMarks === null ? "" : String(q.awardedMarks),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (attempt.essays.some((q) => marks[q.id] === ""))
        throw new Error("Assign marks to every essay, including unanswered responses.");
      const body = manualQuizGradeSchema.parse({
        attemptId: attempt.id,
        answers: attempt.essays.map((q) => ({
          questionId: q.id,
          awardedMarks: Number(marks[q.id]),
        })),
      });
      return apiFetch(`/teacher/quizzes/${quizId}/grading`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      toast.success("Grades saved. The result stays held for Admin release.");
      await client.invalidateQueries({ queryKey: ["quiz-essay-grading", quizId] });
    },
    onError: (err) => setError(err.message),
  });
  return (
    <article className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-ink">
        {attempt.studentName} · Attempt {attempt.attemptNumber}
      </h3>
      {attempt.essays.map((q, i) => (
        <section
          key={q.id}
          className="space-y-3 rounded-xl border border-line bg-canvas p-3"
        >
          <h4 className="text-base font-semibold text-ink">Essay {i + 1}</h4>
          <QuizRichText value={q.bodyRichText} />
          <p className="whitespace-pre-wrap break-words rounded-xl bg-panel p-3 text-base text-ink">
            {q.answer || "No response submitted."}
          </p>
          <div className="max-w-48 space-y-1">
            <Label htmlFor={`grade-${attempt.id}-${q.id}`} className="text-base">
              Awarded marks (0–{q.marks})
            </Label>
            <Input
              id={`grade-${attempt.id}-${q.id}`}
              type="number"
              min={0}
              max={q.marks}
              step={1}
              className="min-h-11 text-base"
              value={marks[q.id] ?? ""}
              onChange={(e) => setMarks((old) => ({ ...old, [q.id]: e.target.value }))}
            />
          </div>
        </section>
      ))}
      {error && (
        <p role="alert" className="text-base text-ruby">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="min-h-11"
        disabled={mutation.isPending}
        onClick={() => {
          setError("");
          mutation.mutate();
        }}
      >
        {mutation.isPending ? "Saving grades…" : "Save grades"}
      </Button>
    </article>
  );
}
export function QuizEssayGrading({ quizId }: { quizId: number }) {
  const query = useQuery({
    queryKey: ["quiz-essay-grading", quizId],
    queryFn: () =>
      apiFetch<{ data: PendingEssayAttempt[] }>(
        `/teacher/quizzes/${quizId}/grading`,
      ).then((r) => r.data),
  });
  return (
    <section id="essay-grading" className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">Essay grading</h2>
      <p className="text-base text-sub">
        Assign whole marks to every essay. An Admin can release the completed result
        afterward.
      </p>
      {query.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-base text-ruby">
          <p>{query.error.message}</p>
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
        <p
          role="status"
          className="rounded-xl border border-line bg-panel p-4 text-base text-sub"
        >
          No essays are awaiting grading.
        </p>
      ) : (
        query.data.map((attempt) => (
          <EssayAttempt key={attempt.id} attempt={attempt} quizId={quizId} />
        ))
      )}
    </section>
  );
}
