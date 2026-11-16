"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/client-fetch";
import { quizImageLinksSchema } from "@/lib/validation/quiz-images";
import { QUIZ_IMAGE_REFRESH_MS } from "@/lib/quizzes/images";
export function useQuizImageLinks(id: string, authoring: boolean, enabled: boolean) {
  const query = useQuery({
    queryKey: ["quiz-image-links", id, authoring ? "authoring" : "attempt"],
    queryFn: async () => quizImageLinksSchema.parse((await apiFetch<{ data: unknown }>(`${authoring ? "/teacher" : ""}/quizzes/${id}/images`)).data),
    enabled, staleTime: QUIZ_IMAGE_REFRESH_MS, refetchInterval: QUIZ_IMAGE_REFRESH_MS,
  });
  return new Map(query.data?.map((image) => [image.path, image.url] as const));
}
