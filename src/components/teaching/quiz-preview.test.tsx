import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuizPreview } from "./quiz-preview";
import { quizDraftPayloadSchema } from "@/lib/validation/quiz-questions";
import { initialQuizSettings } from "@/lib/validation/quiz-settings";

it("explains an empty quiz without offering a start action", () => {
  const payload = quizDraftPayloadSchema.parse({
    details: { title: "Draft quiz", passMark: 60 },
    settings: initialQuizSettings,
    questions: [], passages: [],
  });
  render(<QuizPreview open onOpenChange={() => {}} payload={payload} coverUrl={null} />);
  expect(screen.getByText("No questions yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
});
