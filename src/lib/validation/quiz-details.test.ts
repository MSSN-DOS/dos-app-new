import { describe, expect, it } from "vitest";

import { MAX_QUIZ_DURATION_SECONDS } from "@/lib/quizzes/duration";
import { RICH_TEXT_MAX_LENGTH } from "./primitives";
import { quizDetailsSchema } from "./quiz-details";

/** Collects `path: message` pairs so assertions can name the exact rule that fired. */
function issuesOf(input: unknown): string[] {
  const result = quizDetailsSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("quizDetailsSchema — defaults", () => {
  it("fills every optional field for a minimal payload", () => {
    const parsed = quizDetailsSchema.parse({ title: "Heat and temperature" });
    expect(parsed).toEqual({
      title: "Heat and temperature",
      description: null,
      instructions: null,
      durationSeconds: null,
      passMark: 60,
      visibility: "private",
    });
  });

  it("trims the title", () => {
    expect(quizDetailsSchema.parse({ title: "  Heat  " }).title).toBe("Heat");
  });

  it("defaults a new quiz to private", () => {
    expect(quizDetailsSchema.parse({ title: "Q" }).visibility).toBe("private");
  });
});

describe("quizDetailsSchema — title", () => {
  it("rejects a missing title", () => {
    // A missing key fails the type check before the trim/min message applies, so
    // assert the field that is blamed rather than the wording.
    const result = quizDetailsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["title"]);
  });

  it("rejects a whitespace-only title", () => {
    expect(issuesOf({ title: "   " })).toContain("title: Give the quiz a title");
  });

  it("rejects a title over 200 characters", () => {
    expect(issuesOf({ title: "a".repeat(201) })).toContain(
      "title: Keep the title under 200 characters",
    );
  });

  it("accepts a title at the limit", () => {
    expect(quizDetailsSchema.safeParse({ title: "a".repeat(200) }).success).toBe(true);
  });
});

describe("quizDetailsSchema — rich text", () => {
  it("accepts markup up to the shared ceiling", () => {
    const body = `<p>${"a".repeat(RICH_TEXT_MAX_LENGTH - 7)}</p>`;
    expect(quizDetailsSchema.safeParse({ title: "Q", description: body }).success).toBe(true);
    expect(quizDetailsSchema.safeParse({ title: "Q", instructions: body }).success).toBe(true);
  });

  it("rejects text over the ceiling", () => {
    const body = "a".repeat(RICH_TEXT_MAX_LENGTH + 1);
    expect(quizDetailsSchema.safeParse({ title: "Q", description: body }).success).toBe(false);
    expect(quizDetailsSchema.safeParse({ title: "Q", instructions: body }).success).toBe(false);
  });

  it("treats an empty string as stored-as-is, not as null", () => {
    // The UI sends null for "cleared"; an empty string is also valid and saves.
    expect(quizDetailsSchema.parse({ title: "Q", description: "" }).description).toBe("");
  });
});

describe("quizDetailsSchema — duration", () => {
  it("defaults to untimed", () => {
    expect(quizDetailsSchema.parse({ title: "Q" }).durationSeconds).toBeNull();
  });

  it("accepts a seconds-granularity limit", () => {
    expect(quizDetailsSchema.parse({ title: "Q", durationSeconds: 90 }).durationSeconds).toBe(90);
  });

  it("accepts a numeric string, because select values arrive as strings", () => {
    expect(quizDetailsSchema.parse({ title: "Q", durationSeconds: "90" }).durationSeconds).toBe(90);
  });

  it("accepts the maximum the selects can display", () => {
    expect(
      quizDetailsSchema.safeParse({ title: "Q", durationSeconds: MAX_QUIZ_DURATION_SECONDS }).success,
    ).toBe(true);
  });

  it("rejects zero, negatives, fractions and values over the ceiling", () => {
    expect(issuesOf({ title: "Q", durationSeconds: 0 })).toContain(
      "durationSeconds: A time limit must be at least one second",
    );
    expect(quizDetailsSchema.safeParse({ title: "Q", durationSeconds: -1 }).success).toBe(false);
    expect(quizDetailsSchema.safeParse({ title: "Q", durationSeconds: 1.5 }).success).toBe(false);
    expect(
      quizDetailsSchema.safeParse({ title: "Q", durationSeconds: MAX_QUIZ_DURATION_SECONDS + 1 })
        .success,
    ).toBe(false);
  });
});

describe("quizDetailsSchema — pass mark", () => {
  it("defaults to 60", () => {
    expect(quizDetailsSchema.parse({ title: "Q" }).passMark).toBe(60);
  });

  it("accepts any whole percentage from 1 to 100", () => {
    expect(quizDetailsSchema.parse({ title: "Q", passMark: 1 }).passMark).toBe(1);
    expect(quizDetailsSchema.parse({ title: "Q", passMark: 100 }).passMark).toBe(100);
    expect(quizDetailsSchema.parse({ title: "Q", passMark: "75" }).passMark).toBe(75);
  });

  it("rejects an out-of-range, fractional or cleared pass mark", () => {
    expect(issuesOf({ title: "Q", passMark: 0 })).toContain(
      "passMark: Pass mark must be at least 1%",
    );
    expect(issuesOf({ title: "Q", passMark: 101 })).toContain(
      "passMark: Pass mark cannot exceed 100%",
    );
    expect(quizDetailsSchema.safeParse({ title: "Q", passMark: 60.5 }).success).toBe(false);
    expect(quizDetailsSchema.safeParse({ title: "Q", passMark: null }).success).toBe(false);
  });

  it("never yields null, because quizzes.pass_mark is NOT NULL", () => {
    expect(quizDetailsSchema.parse({ title: "Q", passMark: undefined }).passMark).toBe(60);
  });
});

describe("quizDetailsSchema — visibility", () => {
  it("accepts both stored values", () => {
    expect(quizDetailsSchema.parse({ title: "Q", visibility: "public" }).visibility).toBe("public");
    expect(quizDetailsSchema.parse({ title: "Q", visibility: "private" }).visibility).toBe("private");
  });

  it("rejects a value outside the enum", () => {
    expect(quizDetailsSchema.safeParse({ title: "Q", visibility: "unlisted" }).success).toBe(false);
  });
});
