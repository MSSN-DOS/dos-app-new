import { describe, expect, it } from "vitest";
import { quizDraftPayloadSchema } from "@/lib/validation/quiz-questions";
import { draftFingerprint, reconcileSavedBuilder } from "./autosave";
const draft = () =>
  quizDraftPayloadSchema.parse({
    details: { title: "Mechanics" },
    passages: [{ clientKey: "p", title: "Reading", bodyRichText: "Text" }],
    questions: [
      { clientKey: "a", questionType: "essay", bodyRichText: "First", passageKey: "p" },
    ],
  });
describe("autosave reconciliation", () => {
  it("keeps edits and new cards typed during an in-flight save", () => {
    const sent = draft();
    const current = {
      ...sent,
      details: { ...sent.details, title: "Edited during save" },
      questions: [
        { ...sent.questions[0], bodyRichText: "Latest" },
        { ...sent.questions[0], clientKey: "b" },
      ],
    };
    const result = reconcileSavedBuilder(current, sent, {
      revision: 1,
      status: "draft",
      questionIds: [12],
      passageIds: { p: 4 },
    });
    expect(result.details.title).toBe("Edited during save");
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({ id: 12, bodyRichText: "Latest" });
    expect(result.questions[1].id).toBeUndefined();
    expect(result.passages[0].id).toBe(4);
  });
  it("uses client keys after reorder and never resurrects deleted questions", () => {
    const sent = draft();
    const current = { ...sent, questions: [] };
    expect(
      reconcileSavedBuilder(current, sent, {
        revision: 1,
        status: "draft",
        questionIds: [12],
        passageIds: {},
      }).questions,
    ).toEqual([]);
  });
  it("ignores persistence identities while detecting content changes", () => {
    const before = draft();
    const serverDocument = { ...before, id: 33, revision: 9, status: "draft" };
    expect(draftFingerprint(serverDocument)).toBe(draftFingerprint(before));
    expect(
      draftFingerprint({
        ...before,
        questions: before.questions.map((q) => ({ ...q, id: 22 })),
      }),
    ).toBe(draftFingerprint(before));
    expect(
      draftFingerprint({ ...before, details: { ...before.details, title: "Changed" } }),
    ).not.toBe(draftFingerprint(before));
  });
  it("ignores object-key order after shared Zod parses an edited card", () => {
    const before = draft();
    const reversed = Object.fromEntries(Object.entries(before.questions[0]).reverse());
    const reparsed = quizDraftPayloadSchema.parse({ ...before, questions: [reversed] });
    expect(
      draftFingerprint({
        ...before,
        questions: [{ ...reparsed.questions[0], bodyRichText: "First" }],
      }),
    ).toBe(draftFingerprint(before));
    expect(draftFingerprint(before)).toBe(
      draftFingerprint({
        ...before,
        details: Object.fromEntries(
          Object.entries(before.details).reverse(),
        ) as typeof before.details,
      }),
    );
  });
});
