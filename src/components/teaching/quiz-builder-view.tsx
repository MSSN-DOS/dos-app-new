"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/auth/client-fetch";
import { quizBuilderDocumentSchema } from "@/lib/validation/quiz-builder";
import { QuizBuilderEditor } from "./quiz-builder-editor";
export function QuizBuilderView({ basePath }: { basePath: string }) {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["quiz-builder", id],
    queryFn: async () => {
      const result = await apiFetch<{ data: unknown }>(`/teacher/quizzes/${id}/builder`);
      return quizBuilderDocumentSchema.parse(result.data);
    },
    refetchOnWindowFocus: false,
  });
  if (query.isPending)
    return (
      <div aria-busy="true" aria-label="Loading quiz builder" className="space-y-5">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-line bg-panel p-5">
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
    );
  return <QuizBuilderEditor key={id} document={query.data} basePath={basePath} />;
}
