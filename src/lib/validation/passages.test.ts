import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { RICH_TEXT_MAX_LENGTH } from "./primitives";
import { passageDraftSchema, passagePublishSchema } from "./passages";

function issuesOf(schema: ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("passageDraftSchema", () => {
  it("saves a half-written passage", () => {
    expect(passageDraftSchema.safeParse({ courseId: 4, bodyRichText: "" }).success).toBe(true);
  });

  it("keeps the optional title nullable-ish and bounded", () => {
    expect(passageDraftSchema.safeParse({ courseId: 4, bodyRichText: "", title: "Poem" }).success).toBe(
      true,
    );
    expect(passageDraftSchema.safeParse({ courseId: 4, bodyRichText: "", title: "a".repeat(201) }).success).toBe(
      false,
    );
  });

  it("requires exactly one track, mirroring passages_track_check", () => {
    expect(issuesOf(passageDraftSchema, { bodyRichText: "x" })).toContain(
      "courseId: Pick a course or a JAMB subject for this passage",
    );
    expect(issuesOf(passageDraftSchema, { courseId: 1, jambSubjectId: 2, bodyRichText: "x" })).toContain(
      "jambSubjectId: A passage cannot belong to both a course and a JAMB subject",
    );
  });

  it("accepts a JAMB subject on its own", () => {
    expect(passageDraftSchema.safeParse({ jambSubjectId: 7, bodyRichText: "" }).success).toBe(true);
  });

  it("rejects body text over the shared ceiling", () => {
    expect(
      passageDraftSchema.safeParse({ courseId: 1, bodyRichText: "a".repeat(RICH_TEXT_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});

describe("passagePublishSchema", () => {
  it("accepts a passage with text", () => {
    expect(passagePublishSchema.safeParse({ courseId: 4, bodyRichText: "<p>Once upon a time</p>" }).success).toBe(
      true,
    );
  });

  it("blocks an empty or whitespace-only passage", () => {
    expect(issuesOf(passagePublishSchema, { courseId: 4, bodyRichText: "" })).toContain(
      "bodyRichText: Passage text is required before publishing",
    );
    expect(issuesOf(passagePublishSchema, { courseId: 4, bodyRichText: "   " })).toContain(
      "bodyRichText: Passage text is required before publishing",
    );
  });

  it("still enforces the track rule", () => {
    expect(passagePublishSchema.safeParse({ bodyRichText: "text" }).success).toBe(false);
  });
});
