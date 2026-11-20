import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BankTypeDialog } from "./bank-type-dialog";
describe("bank type chooser", () => {
  it.each(["True or False", "Multiple choice", "Fill in the gap", "Passage", "Essay"])("opens the functional %s editor", label => {
    const onChoose = vi.fn(); const onOpenChange = vi.fn();
    render(<BankTypeDialog open onOpenChange={onOpenChange} onChoose={onChoose} />);
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onChoose).toHaveBeenCalledOnce(); expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("offers manual essays and excludes nested passages for a child", () => {
    render(<BankTypeDialog open onOpenChange={vi.fn()} onChoose={vi.fn()} allowPassage={false} />);
    expect(screen.getByText("Manually graded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passage" })).not.toBeInTheDocument();
  });
});
