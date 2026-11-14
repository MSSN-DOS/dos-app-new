"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/auth/client-fetch";
import {
  quizPreferencesSchema,
  type QuizPreferences,
  type QuizSettingKey,
  type QuizSettingsDraftInput,
} from "@/lib/validation/quiz-settings";

export function useQuizPreferences() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["quiz-preferences"],
    queryFn: async () => {
      const result = await apiFetch<{ data: unknown }>("/teacher/quiz-preferences");
      return quizPreferencesSchema.parse(result.data);
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: QuizPreferences) => {
      const result = await apiFetch<{ data: unknown }>("/teacher/quiz-preferences", {
        method: "PUT",
        body: JSON.stringify(value),
      });
      return quizPreferencesSchema.parse(result.data);
    },
    onSuccess: (value) => {
      client.setQueryData(["quiz-preferences"], value);
    },
    onError: (err) => toast.error(err.message),
  });
  const pinned = query.data?.pinned ?? [];
  const pin = (key: QuizSettingKey) => {
    if (mutation.isPending || !query.data) return;
    mutation.mutate({
      ...query.data,
      pinned: pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key],
    });
  };
  const saveDefaults = (settings: QuizSettingsDraftInput) => {
    if (!query.data) return;
    mutation.mutate(
      { pinned, defaults: { ...settings, opensAt: null, closesAt: null } },
      { onSuccess: () => toast.success("Your quiz defaults were saved.") },
    );
  };
  return { query, mutation, pinned, pin, saveDefaults };
}
