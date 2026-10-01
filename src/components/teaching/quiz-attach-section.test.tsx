/**
 * Component tests for the attach section's *selection lifecycle*.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The rest of the section's logic was extracted to `@/lib/quizzes/builder-validation` and tested
 * there. What is left here is state that only a component can exercise, and it is exactly the part
 * that was previously unreachable by any test: the parent's mutation callbacks call back into this
 * component to clear the tick selection, and a mistake there is invisible until a teacher attaches
 * a question and watches the ticks stay lit, then re-submits rows the server will skip.
 *
 * These are written against rendered output (`getByRole`, `toBeChecked`) rather than internals, so a
 * refactor that changes the markup's structure but not its behaviour still passes.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  QuizAttachSection,
  type AttachedQuestion,
  type BankQuestion,
  type BankFilters,
} from "./quiz-attach-section";
import type { BuilderForm } from "@/lib/quizzes/builder-validation";

const form: BuilderForm = {
  title: "Alkanes",
  instructions: "",
  questionCount: "20",
  timeLimit: "30",
  passMark: "40",
  allowMultipleAttempts: false,
  loseFocusPolicy: "warn",
  weekStart: "2026-02-21",
  quizType: "topic",
};

const available: BankQuestion[] = [
  { id: 11, bodyRichText: "<p>Alpha question</p>", questionType: "options", status: "published" },
  { id: 12, bodyRichText: "<p>Beta question</p>", questionType: "options", status: "published" },
  { id: 13, bodyRichText: "<p>Draft question</p>", questionType: "options", status: "draft" },
];

const attached: AttachedQuestion[] = [
  { questionId: 21, bodyRichText: "<p>Attached one</p>", questionType: "options", topicId: 3, status: "published" },
];

function setup(overrides: Partial<Parameters<typeof QuizAttachSection>[0]> = {}) {
  const handlers = {
    onAttachOne: vi.fn(),
    onAttachMany: vi.fn(),
    onDetachOne: vi.fn(),
    onDetachMany: vi.fn(),
    onFiltersChange: vi.fn(),
    onRetry: vi.fn(),
  };
  const filters: BankFilters = { topic: "__all__", type: "__all__", search: "" };
  const props = {
    form,
    attachedRows: attached,
    availableRows: available,
    topics: [],
    filters,
    bankState: { isPending: false, isError: false, error: null, refetch: vi.fn() },
    attachable: available.filter((q) => q.status === "published"),
    actionError: null,
    attachPending: false,
    attachManyPending: false,
    resetSelectionKey: 0,
    ...handlers,
    ...overrides,
  };
  return { ...render(<QuizAttachSection {...props} />), handlers, props };
}

const checkboxNamed = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("QuizAttachSection selection", () => {
  it("ticks a row and sends exactly that row to onAttachMany", async () => {
    const user = userEvent.setup();
    const { handlers } = setup();

    await user.click(checkboxNamed(/Select question 11 to attach/));
    await user.click(screen.getByRole("button", { name: /Attach 1/ }));

    expect(handlers.onAttachMany).toHaveBeenCalledWith([11]);
  });

  it("clears the tick after a successful attach, driven by the parent's reset key", async () => {
    const user = userEvent.setup();
    const { handlers, props, rerender } = setup();

    await user.click(checkboxNamed(/Select question 11 to attach/));
    expect(checkboxNamed(/Select question 11 to attach/)).toBeChecked();

    // The parent bumps the key from its mutation's onSuccess, then re-renders.
    rerender(<QuizAttachSection {...props} resetSelectionKey={props.resetSelectionKey + 1} />);

    expect(checkboxNamed(/Select question 11 to attach/)).not.toBeChecked();
    // And the button is disabled again, which is the user-visible consequence.
    expect(screen.getByRole("button", { name: /Attach selected/ })).toBeDisabled();
    void handlers;
  });

  it("clears the selection when the parent bumps the key after a detach", async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup();

    await user.click(screen.getByRole("tab", { name: /Attached/ }));
    await user.click(checkboxNamed(/Select question 21 to detach/));
    expect(checkboxNamed(/Select question 21 to detach/)).toBeChecked();

    rerender(<QuizAttachSection {...props} resetSelectionKey={2} />);

    expect(checkboxNamed(/Select question 21 to detach/)).not.toBeChecked();
  });

  it("does not send a detach request until a row is ticked", async () => {
    const user = userEvent.setup();
    const { handlers } = setup();

    await user.click(screen.getByRole("tab", { name: /Attached/ }));
    await user.click(checkboxNamed(/Select question 21 to detach/));
    await user.click(screen.getByRole("button", { name: /Remove 1/ }));

    expect(handlers.onDetachMany).toHaveBeenCalledWith([21]);
    expect(handlers.onDetachOne).not.toHaveBeenCalled();
  });

  it("drops the selection when the tab changes", async () => {
    // Ticks are ids chosen against one result set. Carrying them across a tab change lets
    // "Remove selected" act on rows the teacher is no longer looking at.
    const user = userEvent.setup();
    const { handlers } = setup();

    await user.click(checkboxNamed(/Select question 11 to attach/));
    await user.click(screen.getByRole("tab", { name: /Attached/ }));
    await user.click(screen.getByRole("tab", { name: /Available bank/ }));

    expect(checkboxNamed(/Select question 11 to attach/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Attach selected/ })).toBeDisabled();
    void handlers;
  });

  it("never offers a draft question for attachment", () => {
    setup();

    // The server rejects drafts; the UI must not present the option at all.
    expect(checkboxNamed(/Draft questions cannot be attached yet/)).toBeDisabled();
    // Two "Add" buttons for the two published rows, not three — the draft has none. Asserting on
    // absence with a name matcher would pass for the wrong reason if a third row appeared, so
    // count them instead.
    expect(screen.getAllByRole("button", { name: "Add" })).toHaveLength(2);
  });

  it("reports a filter change to the parent rather than fetching itself", async () => {
    // The parent owns the query and its cache key. If this component fetched, two different
    // filter states could share one cache entry.
    const user = userEvent.setup();
    const { handlers } = setup();

    await user.type(screen.getByRole("textbox", { name: /Search the question bank/ }), "a");

    expect(handlers.onFiltersChange).toHaveBeenCalledWith({ search: "a" });
  });

  it("selects every publishable row with select-all, excluding drafts", async () => {
    const user = userEvent.setup();
    const { handlers } = setup();

    await user.click(checkboxNamed(/Select all published questions/));
    await user.click(screen.getByRole("button", { name: /Attach 2/ }));

    // Two, not three: the draft is in the list but not attachable.
    expect(handlers.onAttachMany).toHaveBeenCalledWith([11, 12]);
  });

  it("shows the bank error with a retry that calls back up", async () => {
    const user = userEvent.setup();
    const { handlers } = setup({
      bankState: {
        isPending: false,
        isError: true,
        error: { message: "Question bank is unavailable" },
        refetch: vi.fn(),
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Question bank is unavailable");
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(handlers.onRetry).toHaveBeenCalled();
  });

  it("names the quiz type's fixed requirement in the attached count", () => {
    setup({ form: { ...form, quizType: "course" } });

    // A Course Quiz reads "1 of 50 attached" regardless of what questionCount holds.
    expect(screen.getByText(/1 of 50 attached/)).toBeInTheDocument();
  });
});

describe("QuizAttachSection loading and empty states", () => {
  it("shows skeletons, not a spinner, while the bank loads", () => {
    setup({
      availableRows: [],
      attachable: [],
      bankState: { isPending: true, isError: false, error: null, refetch: vi.fn() },
    });

    expect(screen.getByLabelText("Loading the question bank")).toBeInTheDocument();
    expect(screen.queryByText("Nothing left to attach.")).not.toBeInTheDocument();
  });

  it("distinguishes an empty bank from a pending one", () => {
    setup({ availableRows: [], attachable: [] });
    expect(screen.getByText("Nothing left to attach.")).toBeInTheDocument();
  });

  it("distinguishes no-attached-questions from an empty bank", async () => {
    const user = userEvent.setup();
    setup({ attachedRows: [] });

    await user.click(screen.getByRole("tab", { name: /Attached/ }));
    expect(screen.getByText("No questions attached yet.")).toBeInTheDocument();
  });

  it("strips HTML from question bodies before showing them as a single line", () => {
    setup();

    // The stored value is rich text; the list is one line, so tags must not render.
    const list = screen.getByRole("list");
    expect(within(list).getByText("Alpha question")).toBeInTheDocument();
    expect(list.textContent).not.toContain("<p>");
  });
});