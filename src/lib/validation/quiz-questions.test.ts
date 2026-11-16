import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import type { QuizDraftPayloadInput } from "./quiz-questions";
import {
  collectQuizPublishBlockers,
  quizDraftPayloadSchema,
  quizPublishPayloadSchema,
  quizQuestionDraftSchema,
  quizQuestionPublishSchema,
} from "./quiz-questions";

const correctPair = [
  { optionText: "4", isCorrect: true },
  { optionText: "5", isCorrect: false },
];

describe("essay and passage publish rules", () => {
  it("allows essays without an automatic answer key", () => {
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "essay",
        bodyRichText: "Explain Bernoulli's principle",
        marks: 5,
      }).success,
    ).toBe(true);
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "essay",
        bodyRichText: "<p></p>",
        marks: 5,
      }).success,
    ).toBe(false);
  });
  it("keeps incomplete passages in drafts and blocks publication", () => {
    const payload = {
      details: { title: "Quiz" },
      passages: [{ clientKey: "p", bodyRichText: "" }],
      questions: [
        { questionType: "essay", bodyRichText: "Explain", passageKey: "p", marks: 2 },
      ],
    };
    expect(quizDraftPayloadSchema.safeParse(payload).success).toBe(true);
    expect(collectQuizPublishBlockers(payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "passages.0.bodyRichText" }),
      ]),
    );
  });
  it("rejects missing passages and passages without sub-questions", () => {
    const base = {
      details: { title: "Quiz" },
      questions: [
        {
          questionType: "essay",
          bodyRichText: "Explain",
          passageKey: "missing",
          marks: 2,
        },
      ],
      passages: [{ clientKey: "empty", bodyRichText: "Text" }],
    };
    expect(collectQuizPublishBlockers(base).map((b) => b.message)).toEqual(
      expect.arrayContaining([
        "The shared passage is missing",
        "Add a sub-question to this passage",
      ]),
    );
  });
});

function issuesOf(schema: ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("quizQuestionDraftSchema", () => {
  it("keeps a half-built card", () => {
    expect(
      quizQuestionDraftSchema.safeParse({ questionType: "options", bodyRichText: "" })
        .success,
    ).toBe(true);
  });

  it("defaults marks to 1 and allows an explicit 0 while drafting", () => {
    expect(
      quizQuestionDraftSchema.parse({ questionType: "options", bodyRichText: "" }).marks,
    ).toBe(1);
    expect(
      quizQuestionDraftSchema.parse({
        questionType: "options",
        bodyRichText: "",
        marks: 0,
      }).marks,
    ).toBe(0);
  });

  it("coerces a marks string from the form control", () => {
    expect(
      quizQuestionDraftSchema.parse({
        questionType: "options",
        bodyRichText: "",
        marks: "3",
      }).marks,
    ).toBe(3);
  });

  it("carries no track fields — the quiz owns the track", () => {
    const parsed = quizQuestionDraftSchema.parse({
      questionType: "options",
      bodyRichText: "Q",
      courseId: 99,
    });
    expect(parsed).not.toHaveProperty("courseId");
  });

  it("accepts a reason and a passage id", () => {
    expect(
      quizQuestionDraftSchema.safeParse({
        questionType: "options",
        bodyRichText: "Q",
        reasonRichText: "<p>Because.</p>",
        passageId: 3,
      }).success,
    ).toBe(true);
  });

  it("rejects a marks value that cannot be stored", () => {
    expect(
      quizQuestionDraftSchema.safeParse({
        questionType: "options",
        bodyRichText: "",
        marks: -1,
      }).success,
    ).toBe(false);
    expect(
      quizQuestionDraftSchema.safeParse({
        questionType: "options",
        bodyRichText: "",
        marks: 2.5,
      }).success,
    ).toBe(false);
  });
});

describe("quizQuestionPublishSchema", () => {
  it.each(["<p></p>", "<p><strong>&nbsp;</strong></p>", "<script>text</script>"])(
    "allows an empty rich-text draft but blocks publishing it: %s",
    (bodyRichText) => {
      const payload = {
        questionType: "options",
        bodyRichText,
        options: correctPair,
        marks: 1,
      };
      expect(quizQuestionDraftSchema.safeParse(payload).success).toBe(true);
      expect(quizQuestionPublishSchema.safeParse(payload).success).toBe(false);
    },
  );

  it("accepts an equation as question content and rejects formatting-only options", () => {
    const payload = {
      questionType: "options",
      bodyRichText: '<span data-type="inline-math" data-latex="x^2"></span>',
      options: correctPair,
      marks: 1,
    };
    expect(quizQuestionPublishSchema.safeParse(payload).success).toBe(true);
    expect(
      quizQuestionPublishSchema.safeParse({
        ...payload,
        options: [{ optionText: "<p></p>", isCorrect: true }, correctPair[1]],
      }).success,
    ).toBe(false);
  });
  it("publishes a complete options question", () => {
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "options",
        bodyRichText: "2 + 2?",
        options: correctPair,
        marks: 2,
      }).success,
    ).toBe(true);
  });

  it("publishes a complete fill-in-the-gap question", () => {
    expect(
      quizQuestionPublishSchema.safeParse({
        questionType: "fill_in_gap",
        bodyRichText: "Water boils at [gap]°C.",
        blanks: [{ acceptedAnswer: "100" }],
        marks: 1,
      }).success,
    ).toBe(true);
  });

  it("applies the same answer rules as the question bank", () => {
    // Delegated to `checkAnswerPayload` — this asserts the delegation, not a copy.
    expect(
      issuesOf(quizQuestionPublishSchema, {
        questionType: "options",
        bodyRichText: "Q",
        options: [{ optionText: "4", isCorrect: false }],
      }),
    ).toContain("options: Options questions need at least two options before publishing");
  });

  it("blocks an empty body", () => {
    expect(
      issuesOf(quizQuestionPublishSchema, {
        questionType: "options",
        bodyRichText: " ",
        options: correctPair,
      }),
    ).toContain("bodyRichText: Question text is required before publishing");
  });

  it("blocks a question worth zero marks", () => {
    expect(
      issuesOf(quizQuestionPublishSchema, {
        questionType: "options",
        bodyRichText: "Q",
        options: correctPair,
        marks: 0,
      }),
    ).toContain("marks: A published question is worth at least one mark");
  });
});

describe("quizDraftPayloadSchema", () => {
  it.each(["id", "clientKey"] as const)("rejects duplicate %s before a batch save", (field) => {
    const question = { questionType: "essay", bodyRichText: "", [field]: field === "id" ? 10 : "same" };
    const result = quizDraftPayloadSchema.safeParse({ details: { title: "Heat" }, questions: [question, question] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["questions", 1, field]);
  });
  it("allows copies with independent card identities", () => {
    const q = { questionType: "essay", bodyRichText: "Same text" };
    expect(quizDraftPayloadSchema.safeParse({ details: { title: "Heat" }, questions: [{ ...q, id: 10, clientKey: "original" }, { ...q, clientKey: "copy" }] }).success).toBe(true);
  });
  it("rejects ambiguous passage keys", () => {
    const p = { clientKey: "same", bodyRichText: "" };
    expect(quizDraftPayloadSchema.safeParse({ details: { title: "Heat" }, passages: [p, p] }).success).toBe(false);
  });
  it("saves a titled quiz with no questions yet", () => {
    const parsed = quizDraftPayloadSchema.parse({ details: { title: "Heat" } });
    expect(parsed.details.title).toBe("Heat");
    expect(parsed.questions).toEqual([]);
  });

  it("saves a draft whose questions are incomplete", () => {
    expect(
      quizDraftPayloadSchema.safeParse({
        details: { title: "Heat" },
        questions: [{ questionType: "options", bodyRichText: "", marks: 0 }],
      }).success,
    ).toBe(true);
  });

  it("still requires a title, because quizzes.title is NOT NULL", () => {
    expect(quizDraftPayloadSchema.safeParse({ details: { title: "" } }).success).toBe(
      false,
    );
  });
});

describe("quizPublishPayloadSchema", () => {
  const publishable = {
    details: { title: "Heat", passMark: 60 },
    questions: [
      { questionType: "options", bodyRichText: "2 + 2?", options: correctPair, marks: 1 },
      {
        questionType: "fill_in_gap",
        bodyRichText: "[gap]°C.",
        blanks: [{ acceptedAnswer: "100" }],
        marks: 2,
      },
    ],
  };

  it("publishes a complete quiz", () => {
    expect(quizPublishPayloadSchema.safeParse(publishable).success).toBe(true);
  });

  it("blocks a quiz with no questions", () => {
    expect(
      issuesOf(quizPublishPayloadSchema, { details: { title: "Heat" }, questions: [] }),
    ).toContain("questions: Add at least one question before publishing");
  });

  it("names the offending question by index", () => {
    const result = quizPublishPayloadSchema.safeParse({
      ...publishable,
      questions: [
        publishable.questions[0],
        { questionType: "options", bodyRichText: "", marks: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some(
        (issue) => issue.path[0] === "questions" && issue.path[1] === 1,
      ),
    ).toBe(true);
  });
});

describe("collectQuizPublishBlockers", () => {
  it("returns nothing when the quiz is publishable", () => {
    expect(
      collectQuizPublishBlockers({
        details: { title: "Heat" },
        questions: [
          { questionType: "options", bodyRichText: "Q", options: correctPair, marks: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it("returns one path: message pair per problem, ready for the blockers summary", () => {
    const blockers = collectQuizPublishBlockers({
      details: { title: "" },
      questions: [],
    });
    expect(blockers).toContainEqual({
      path: "details.title",
      message: "Give the quiz a title",
    });
    expect(blockers).toContainEqual({
      path: "questions",
      message: "Add at least one question before publishing",
    });
  });

  it("never throws on junk input", () => {
    expect(() => collectQuizPublishBlockers(null)).not.toThrow();
    expect(collectQuizPublishBlockers(null).length).toBeGreaterThan(0);
  });
});

describe("payload types", () => {
  it("keeps the draft type assignable from a parsed draft payload", () => {
    const parsed: QuizDraftPayloadInput = quizDraftPayloadSchema.parse({
      details: { title: "Heat" },
    });
    expect(parsed.questions).toHaveLength(0);
  });
});
