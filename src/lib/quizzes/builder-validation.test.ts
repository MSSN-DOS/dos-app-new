import { describe, expect, it } from "vitest";

import {
  attachProgress,
  buildQuizPatch,
  COURSE_QUIZ_QUESTION_COUNT,
  publishBlockers,
  requiredQuestionCount,
  type BuilderForm,
} from "./builder-validation";

function form(overrides: Partial<BuilderForm> = {}): BuilderForm {
  return {
    title: "Organic Chemistry — Alkanes",
    instructions: "Answer every question.",
    questionCount: "20",
    timeLimit: "30",
    passMark: "40",
    allowMultipleAttempts: false,
    loseFocusPolicy: "warn",
    weekStart: "2026-02-21",
    quizType: "topic",
    ...overrides,
  };
}

describe("requiredQuestionCount", () => {
  it("fixes a Course Quiz at the Board-mandated 50, ignoring the form's own count", () => {
    // The count input is still editable in the UI for a Course Quiz. If it ever leaked into this
    // calculation a teacher could set 1 and publish a Course Quiz with a single question.
    expect(requiredQuestionCount(form({ quizType: "course", questionCount: "1" }), 0)).toBe(
      COURSE_QUIZ_QUESTION_COUNT,
    );
    expect(requiredQuestionCount(form({ quizType: "course", questionCount: "999" }), 0)).toBe(
      COURSE_QUIZ_QUESTION_COUNT,
    );
  });

  it("uses the author's own count for a Topic Quiz", () => {
    expect(requiredQuestionCount(form({ quizType: "topic", questionCount: "7" }), 0)).toBe(7);
  });

  it("treats a blank or non-numeric count as zero rather than NaN", () => {
    // NaN would make every comparison false and report "Attach NaN more question(s)".
    expect(requiredQuestionCount(form({ questionCount: "" }), 0)).toBe(0);
    expect(requiredQuestionCount(form({ questionCount: "abc" }), 0)).toBe(0);
  });
});

describe("publishBlockers", () => {
  it("reports nothing for a complete, valid quiz", () => {
    expect(publishBlockers(form({ questionCount: "20" }), 20)).toEqual([]);
  });

  it("names every missing field at once, so a teacher can fix them in one pass", () => {
    const blockers = publishBlockers(
      form({ title: "   ", questionCount: "0", timeLimit: "999", passMark: "abc", weekStart: "" }),
      0,
    );
    expect(blockers).toEqual([
      "Give the quiz a title",
      "Question count must be between 1 and 100",
      "Time limit must be between 1 and 600 minutes",
      "Pass mark must be between 1 and 100 percent",
    ]);
    // No "attach N more" line here, and that is deliberate: an unparseable count resolves the
    // required total to 0, so `attachedCount < required` is false. The count blocker already
    // explains the problem, and a second line saying "Attach 0 more question(s)" would be noise
    // that reads as a bug to the teacher looking at it.
  });

  it("still reports the attach shortfall when the count is valid but unmet", () => {
    expect(publishBlockers(form({ questionCount: "20" }), 3)).toContain(
      "Attach 17 more question(s) (3 of 20)",
    );
  });

  it("requires a week start for a Course Quiz but not a Topic Quiz", () => {
    // Topic Quizzes have no week and no leaderboard, so there is nothing to schedule against.
    // This is the check that would wrongly block every Topic Quiz if it were unconditional.
    expect(publishBlockers(form({ quizType: "course", weekStart: "" }), 20)).toContain(
      "Pick a Saturday week start date",
    );
    expect(publishBlockers(form({ quizType: "topic", weekStart: "" }), 20)).not.toContain(
      "Pick a Saturday week start date",
    );
  });

  it("rejects a half-typed date rather than accepting it as ISO-shaped", () => {
    expect(publishBlockers(form({ quizType: "course", weekStart: "2026-02" }), 20)).toContain(
      "Pick a Saturday week start date",
    );
    expect(publishBlockers(form({ quizType: "course", weekStart: "21/02/2026" }), 20)).toContain(
      "Pick a Saturday week start date",
    );
  });

  it("blocks a Course Quiz short of 50 questions and says how many are missing", () => {
    const blockers = publishBlockers(form({ quizType: "course" }), 12);
    expect(blockers).toEqual([
      "Attach 38 more question(s) (12 of 50)",
    ]);
  });

  it("does not block for surplus questions", () => {
    // More than 50 is fine — the Course Quiz takes the first 50 when it serves.
    expect(publishBlockers(form({ quizType: "course" }), 60)).toEqual([]);
  });

  it("rejects fractional counts and zero, which a bare range check would wave through", () => {
    expect(publishBlockers(form({ questionCount: "2.5" }), 3)).toContain(
      "Question count must be between 1 and 100",
    );
    expect(publishBlockers(form({ questionCount: "0" }), 0)).toContain(
      "Question count must be between 1 and 100",
    );
  });

  it("accepts the inclusive bounds", () => {
    // Off-by-one at the boundary is the classic way these quietly exclude a legitimate value.
    expect(publishBlockers(form({ questionCount: "1", timeLimit: "600", passMark: "100" }), 1)).toEqual([]);
    expect(publishBlockers(form({ questionCount: "100", timeLimit: "1", passMark: "1" }), 100)).toEqual([]);
  });
});

describe("attachProgress", () => {
  it("reports 100 once the threshold is met and never exceeds it", () => {
    expect(attachProgress(form({ quizType: "topic", questionCount: "20" }), 20)).toBe(100);
    expect(attachProgress(form({ quizType: "topic", questionCount: "20" }), 25)).toBe(100);
  });

  it("scales to the required count", () => {
    expect(attachProgress(form({ quizType: "topic", questionCount: "20" }), 5)).toBe(25);
    expect(attachProgress(form({ quizType: "course" }), 25)).toBe(50);
  });

  it("returns 0 rather than NaN when nothing is required or attached", () => {
    // The denominator is guarded against zero; an unguarded 0/0 renders as NaN% in the progress bar.
    expect(attachProgress(form({ questionCount: "" }), 0)).toBe(0);
  });
});

describe("buildQuizPatch", () => {
  it("trims text fields", () => {
    const body = buildQuizPatch(form({ title: "  Alkanes  ", instructions: "  Read all  " }));
    expect(body.title).toBe("Alkanes");
    expect(body.instructions).toBe("Read all");
  });

  it("sends numbers as numbers, not strings", () => {
    const body = buildQuizPatch(form({ questionCount: "20", timeLimit: "30", passMark: "40" }));
    expect(body.questionCount).toBe(20);
    expect(body.timeLimitMinutes).toBe(30);
    expect(body.passMark).toBe(40);
  });

  it("includes weekStart for a Course Quiz", () => {
    expect(buildQuizPatch(form({ quizType: "course", weekStart: "2026-02-21" })).weekStart).toBe(
      "2026-02-21",
    );
  });

  it("omits weekStart entirely for a Topic Quiz rather than sending an empty string", () => {
    // The column is nullable. Sending "" would either violate the date type or persist a value
    // that reads as a real week, which is worse than absent.
    expect(buildQuizPatch(form({ quizType: "topic", weekStart: "" }))).not.toHaveProperty("weekStart");
  });

  it("passes the attempt and focus policies through unchanged", () => {
    const body = buildQuizPatch(
      form({ allowMultipleAttempts: true, loseFocusPolicy: "auto_submit" }),
    );
    expect(body.allowMultipleAttempts).toBe(true);
    expect(body.loseFocusPolicy).toBe("auto_submit");
  });
});