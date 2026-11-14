import { describe, expect, it } from "vitest";
import {
  builderBlocks,
  duplicateBuilderQuestion,
  newBuilderQuestion,
  reorderByKey,
} from "./builder";

describe("passage-aware quiz editing", () => {
  it("moves an entire passage while keeping its sub-question order", () => {
    const questions = [
      newBuilderQuestion("options", "a", "p"),
      newBuilderQuestion("essay", "b", "p"),
      newBuilderQuestion("fill_in_gap", "c"),
    ];
    const blocks = builderBlocks(questions, [
      { clientKey: "p", title: "", bodyRichText: "Text" },
    ]);
    expect(
      reorderByKey(blocks, "p", "c")
        .flatMap((b) => b.questions)
        .map((q) => q.clientKey),
    ).toEqual(["c", "a", "b"]);
  });
  it("keeps a passage editable after its last sub-question is deleted", () => {
    expect(
      builderBlocks([], [{ clientKey: "p", title: "", bodyRichText: "" }]),
    ).toHaveLength(1);
  });
  it("duplicates independently and removes the stored question id", () => {
    const original = { ...newBuilderQuestion("options", "a", "p"), id: 8 };
    const copy = duplicateBuilderQuestion(original, "b");
    copy.options![0].optionText = "Changed";
    expect(original.options![0].optionText).toBe("");
    expect(copy.id).toBeUndefined();
    expect(copy.passageKey).toBe("p");
  });
});
