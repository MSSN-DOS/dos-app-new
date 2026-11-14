"use client";

import { useParams } from "next/navigation";
import { QuizAttemptView } from "@/components/teaching/quiz-attempt-view";

export default function QuizAttemptPage() {
  const { id } = useParams<{ id: string }>();
  return <QuizAttemptView key={id} quizId={id} />;
}
