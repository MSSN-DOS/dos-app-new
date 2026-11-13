import { describe, expect, it } from "vitest";

import {
  focusLossPolicyFor,
  quizSettingsDraftSchema,
  quizSettingsPublishSchema,
} from "./quiz-settings";

/** Settings panel with every toggle off and no schedule — the "nothing configured" state. */
function settings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shuffleQuestions: false,
    shuffleOptions: false,
    allowMultipleAttempts: false,
    allowResume: false,
    permitFocusLoss: false,
    autoNextQuestion: false,
    requireLoginToAttempt: true,
    showAnswersAfter: "never",
    showResultAfter: "after_attempt",
    showCalculator: false,
    deductMarksForWrong: false,
    scheduleEnabled: false,
    opensAt: null,
    closesAt: null,
    ...overrides,
  };
}

describe("quizSettingsDraftSchema", () => {
  it("accepts an untouched panel", () => {
    const result = quizSettingsDraftSchema.safeParse(settings());
    expect(result.success).toBe(true);
  });

  it("defaults a new quiz to private", () => {
    const result = quizSettingsDraftSchema.safeParse(settings());
    expect(result.success && result.data.visibility).toBe("private");
  });

  it("accepts scheduling switched on with no start time yet (mid-edit)", () => {
    const result = quizSettingsDraftSchema.safeParse(settings({ scheduleEnabled: true }));
    expect(result.success).toBe(true);
  });

  it("accepts a window left behind after switching scheduling off (mid-edit)", () => {
    const result = quizSettingsDraftSchema.safeParse(
      settings({
        scheduleEnabled: false,
        opensAt: "2026-11-20T09:00:00Z",
        closesAt: "2026-11-21T09:00:00Z",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an end time that is not after the start time", () => {
    const result = quizSettingsDraftSchema.safeParse(
      settings({
        scheduleEnabled: true,
        opensAt: "2026-11-20T09:00:00Z",
        closesAt: "2026-11-20T09:00:00Z",
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["closesAt"]);
    }
  });

  it("rejects an unknown answer-visibility policy", () => {
    const result = quizSettingsDraftSchema.safeParse(
      settings({ showAnswersAfter: "eventually" }),
    );
    expect(result.success).toBe(false);
  });
});

describe("quizSettingsPublishSchema", () => {
  it("blocks publishing scheduling with no start time", () => {
    const result = quizSettingsPublishSchema.safeParse(
      settings({ scheduleEnabled: true }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["opensAt"]);
    }
  });

  it("blocks publishing leftover dates while scheduling is off", () => {
    const result = quizSettingsPublishSchema.safeParse(
      settings({ opensAt: "2026-11-20T09:00:00Z" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["scheduleEnabled"]);
    }
  });

  it("accepts a coherent schedule", () => {
    const result = quizSettingsPublishSchema.safeParse(
      settings({
        scheduleEnabled: true,
        opensAt: "2026-11-20T09:00:00Z",
        closesAt: "2026-11-21T09:00:00Z",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts scheduling with an open-ended window", () => {
    const result = quizSettingsPublishSchema.safeParse(
      settings({ scheduleEnabled: true, opensAt: "2026-11-20T09:00:00Z" }),
    );
    expect(result.success).toBe(true);
  });

  it("still rejects an inverted window", () => {
    const result = quizSettingsPublishSchema.safeParse(
      settings({
        scheduleEnabled: true,
        opensAt: "2026-11-21T09:00:00Z",
        closesAt: "2026-11-20T09:00:00Z",
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("focusLossPolicyFor", () => {
  it("permits focus loss as ignore", () => {
    expect(focusLossPolicyFor(true)).toBe("ignore");
  });

  it("warns rather than auto-submitting when focus loss is not permitted", () => {
    expect(focusLossPolicyFor(false)).toBe("warn");
  });
});
