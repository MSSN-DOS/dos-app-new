import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { questionDraftSchema, questionPublishSchema } from "./questions";

function issuesOf(schema: ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

const options = (...texts: string[]) => texts.map((optionText) => ({ optionText, isCorrect: false }));

describe("questionDraftSchema", () => {
  it("saves an empty question body", () => {
    expect(
      questionDraftSchema.safeParse({ courseId: 1, questionType: "options", bodyRichText: "" }).success,
    ).toBe(true);
  });

  it("allows an explanation on a draft", () => {
    expect(
      questionDraftSchema.safeParse({
        courseId: 1,
        questionType: "options",
        bodyRichText: "",
        reasonRichText: "<p>Because.</p>",
      }).success,
    ).toBe(true);
  });

  it("carries a passage id without any extra requirement", () => {
    expect(
      questionDraftSchema.safeParse({
        courseId: 1,
        questionType: "options",
        bodyRichText: "",
        passageId: 12,
      }).success,
    ).toBe(true);
  });
});

describe("questionPublishSchema — options", () => {
  const base = { courseId: 1, questionType: "options" as const, bodyRichText: "2 + 2?" };

  it("publishes two options with exactly one correct", () => {
    expect(
      questionPublishSchema.safeParse({
        ...base,
        options: [
          { optionText: "4", isCorrect: true },
          { optionText: "5", isCorrect: false },
        ],
      }).success,
    ).toBe(true);
  });

  it("publishes a True/False pair under the same rules", () => {
    // True/False is a UI preset, not a separate stored type — no variant rule exists.
    expect(
      questionPublishSchema.safeParse({
        ...base,
        options: [
          { optionText: "True", isCorrect: true },
          { optionText: "False", isCorrect: false },
        ],
      }).success,
    ).toBe(true);
  });

  it("blocks fewer than two options", () => {
    expect(
      issuesOf(questionPublishSchema, {
        ...base,
        options: [{ optionText: "4", isCorrect: true }],
      }),
    ).toContain("options: Options questions need at least two options before publishing");
  });

  it("blocks a blank option", () => {
    expect(
      issuesOf(questionPublishSchema, {
        ...base,
        options: [...options("4", "  "), { optionText: "6", isCorrect: true }],
      }),
    ).toContain("options: Every option needs text before publishing");
  });

  it("blocks zero correct and more than one correct", () => {
    expect(
      issuesOf(questionPublishSchema, { ...base, options: options("4", "5") }),
    ).toContain("options: Mark one option as correct before publishing");

    expect(
      issuesOf(questionPublishSchema, {
        ...base,
        options: [
          { optionText: "4", isCorrect: true },
          { optionText: "5", isCorrect: true },
        ],
      }),
    ).toContain("options: Only one option may be marked correct (single-select questions)");
  });

  it("blocks an empty question body", () => {
    expect(
      issuesOf(questionPublishSchema, {
        ...base,
        bodyRichText: "   ",
        options: [
          { optionText: "4", isCorrect: true },
          { optionText: "5", isCorrect: false },
        ],
      }),
    ).toContain("bodyRichText: Question text is required before publishing");
  });
});

describe("questionPublishSchema — fill in the gap", () => {
  const base = {
    courseId: 1,
    questionType: "fill_in_gap" as const,
    bodyRichText: "Water boils at [gap]°C.",
  };

  it("publishes one or more blanks with answers", () => {
    expect(questionPublishSchema.safeParse({ ...base, blanks: [{ acceptedAnswer: "100" }] }).success).toBe(
      true,
    );
    expect(
      questionPublishSchema.safeParse({
        ...base,
        bodyRichText: "A [gap] and a [gap].",
        blanks: [{ acceptedAnswer: "one" }, { acceptedAnswer: "two" }],
      }).success,
    ).toBe(true);
  });

  it("blocks a question with no blanks", () => {
    expect(issuesOf(questionPublishSchema, { ...base, blanks: [] })).toContain(
      "blanks: Fill-in-gap questions need at least one blank before publishing",
    );
  });

  it("blocks a blank with no accepted answer", () => {
    expect(issuesOf(questionPublishSchema, { ...base, blanks: [{ acceptedAnswer: "  " }] })).toContain(
      "blanks: Every blank needs an accepted answer before publishing",
    );
  });
});

describe("questionPublishSchema — track", () => {
  it("requires exactly one track", () => {
    expect(
      questionPublishSchema.safeParse({
        questionType: "options",
        bodyRichText: "Q",
        options: options("a", "b"),
      }).success,
    ).toBe(false);

    expect(
      questionPublishSchema.safeParse({
        courseId: 1,
        jambSubjectId: 2,
        questionType: "options",
        bodyRichText: "Q",
        options: options("a", "b"),
      }).success,
    ).toBe(false);
  });
});
