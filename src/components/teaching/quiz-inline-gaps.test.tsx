import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuizInlineGaps } from "./quiz-inline-gaps";
describe("inline student gaps", () => {
  it("renders blanks inside the sentence and maps answers to their indexes", () => {
    const onChange = vi.fn();
    render(
      <QuizInlineGaps
        body="<p>Power is [gap] per [gap].</p>"
        blankIndexes={[1, 2]}
        answer={{ questionId: 3 }}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Gap 1");
    expect(input.closest("p")?.textContent).toBe("Power is  per .");
    fireEvent.change(input, { target: { value: "energy" } });
    expect(onChange).toHaveBeenCalledWith({
      questionId: 3,
      blankAnswers: { "1": "energy" },
    });
  });
  it("remounts portal targets when the next question has different content", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <QuizInlineGaps
        body="<p>First [gap].</p>"
        blankIndexes={[1]}
        answer={{ questionId: 3 }}
        onChange={onChange}
      />,
    );
    rerender(
      <QuizInlineGaps
        body="<p>Next [gap] then [gap].</p>"
        blankIndexes={[1, 2]}
        answer={{ questionId: 4, blankAnswers: { "1": "kept" } }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Gap 1")).toHaveValue("kept");
    expect(screen.getByLabelText("Gap 2").closest("p")?.textContent).toContain("Next");
  });
});
