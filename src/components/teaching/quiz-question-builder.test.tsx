import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { newBuilderQuestion, type BuilderPassage } from "@/lib/quizzes/builder";
import { QuizQuestionBuilder } from "./quiz-question-builder";

vi.mock("./rich-text-editor", () => ({
  RichTextEditor: ({
    id,
    label,
    value,
    onChange,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label htmlFor={id}>
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  ),
}));

function Harness({ passage = false }: { passage?: boolean }) {
  const [questions, setQuestions] = useState([
    newBuilderQuestion("essay", "a", passage ? "p" : null),
    newBuilderQuestion("options", "b", passage ? "p" : null),
  ]);
  const [passages, setPassages] = useState<BuilderPassage[]>(
    passage ? [{ clientKey: "p", title: "", bodyRichText: "Text" }] : [],
  );
  return (
    <>
      <QuizQuestionBuilder
        questions={questions}
        passages={passages}
        onChange={(qs, ps) => {
          setQuestions(qs);
          setPassages(ps);
        }}
      />
      <output data-testid="order">{questions.map((q) => q.clientKey).join(",")}</output>
    </>
  );
}

describe("quiz builder editing interactions", () => {
  it("provides a keyboard-accessible reorder alternative", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^More/ }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Change position" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(screen.getByTestId("order")).toHaveTextContent("b,a");
  });
  it("applies marks and confirms bulk deletion before changing the quiz", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Set total marks"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Total marks: 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Bulk delete (2)" }));
    expect(screen.getByTestId("order")).toHaveTextContent("a,b");
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    expect(screen.getByText("Your quiz starts here")).toBeInTheDocument();
  });
  it("deleting a passage removes all of its sub-questions", () => {
    render(<Harness passage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete passage and sub-questions" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    expect(screen.getByTestId("order").textContent).toBe("");
    expect(screen.getByText("Your quiz starts here")).toBeInTheDocument();
  });
});
