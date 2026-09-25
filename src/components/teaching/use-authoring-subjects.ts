"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/auth/client-fetch";

export interface AuthoringCourse {
  id: number;
  code: string;
  title: string;
}

export interface AuthoringSubject {
  id: number;
  name: string;
}

interface SubjectsResponse {
  data: {
    courses: AuthoringCourse[];
    jambSubjects: AuthoringSubject[];
  };
}

// The catalogue every authoring picker (Topics, Questions, Quizzes, Videos) must use. It comes
// from /api/teacher/subjects, which serves a Teacher only what an Admin assigned them and an
// Admin the whole catalogue — so the picker can never offer something the write endpoints would
// reject with 403, because both read from the same teaching-scope source.
export function useAuthoringSubjects() {
  const query = useQuery({
    queryKey: ["teacher", "subjects"],
    queryFn: async () => {
      const res = await apiFetch<SubjectsResponse>("/teacher/subjects");
      return res.data;
    },
  });

  const courses = [...(query.data?.courses ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const jambSubjects = [...(query.data?.jambSubjects ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    courses,
    jambSubjects,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}