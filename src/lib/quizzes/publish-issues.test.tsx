import { describe, expect, it } from "vitest";

import { issueLabel, issueTarget, questionProgress } from "../../components/teaching/publish-issues";

describe("issueTarget", () => {
  it("routes question and passage paths to their index", () => {
    expect(issueTarget("questions.2.options")).toEqual({ kind: "question", index: 2 });
    expect(issueTarget("passages.0.bodyRichText")).toEqual({ kind: "passage", index: 0 });
  });
  it("sends the title to the header and other details to settings", () => {
    expect(issueTarget("details.title")).toEqual({ kind: "title" });
    expect(issueTarget("details.passMark")).toEqual({ kind: "settings" });
    expect(issueTarget("settings.opensAt")).toEqual({ kind: "settings" });
  });
  it("falls back to the question list for whole-quiz problems", () => {
    expect(issueTarget("questions")).toEqual({ kind: "list" });
    expect(issueTarget("")).toEqual({ kind: "list" });
  });
});

describe("issueLabel", () => {
  it("numbers questions and passages from one", () => {
    expect(
      issueLabel({ path: "questions.0.body", message: "Add the question text." }),
    ).toBe("Question 1: Add the question text.");
    expect(issueLabel({ path: "passages.1.body", message: "Add the passage." })).toBe(
      "Passage 2: Add the passage.",
    );
    expect(issueLabel({ path: "details.title", message: "Add a title." })).toBe(
      "Add a title.",
    );
  });
});

describe("questionProgress", () => {
  it("reports how many are left and caps the bar", () => {
    expect(questionProgress(37, 50)).toMatchObject({
      label: "37 of 50 questions",
      percent: 74,
      remaining: 13,
      over: 0,
    });
    expect(questionProgress(52, 50)).toMatchObject({
      percent: 100,
      remaining: 0,
      over: 2,
    });
  });
});
