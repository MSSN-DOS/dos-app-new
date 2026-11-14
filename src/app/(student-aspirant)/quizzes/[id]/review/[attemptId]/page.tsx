"use client";

import { useParams } from "next/navigation";
import { QuizReview } from "@/components/teaching/quiz-attempt-view";

export default function QuizReviewPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  return (
    <div className="mx-auto max-w-3xl">
      <QuizReview quizId={id} attemptId={Number(attemptId)} />
    </div>
  );
}
