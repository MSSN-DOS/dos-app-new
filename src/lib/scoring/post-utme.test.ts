import { describe, expect, it } from "vitest";

import { computePostUtme, convertToPostUtmeScale } from "./post-utme";

describe("convertToPostUtmeScale", () => {
  // Board-confirmed 2026-08-25: aggregate is out of 100; best_score is already a
  // percentage, so the conversion is the identity.
  it("passes 100 through unchanged", () => {
    expect(convertToPostUtmeScale(100)).toBe(100);
  });

  it("passes 0 through unchanged", () => {
    expect(convertToPostUtmeScale(0)).toBe(0);
  });

  it("keeps fractional scores on the 2-decimal scale", () => {
    expect(convertToPostUtmeScale(77.333)).toBe(77.33);
  });
});

describe("computePostUtme", () => {
  it("returns the mean raw score and its conversion", () => {
    const result = computePostUtme([
      { userId: 1, bestScore: 60 },
      { userId: 1, bestScore: 80 },
    ]);
    expect(result.get(1)).toEqual({ rawScore: 70, convertedScore50: 70 });
  });

  it("rounds raw score to 2 decimals before converting", () => {
    const result = computePostUtme([
      { userId: 2, bestScore: 100 },
      { userId: 2, bestScore: 66 },
      { userId: 2, bestScore: 66 },
    ]);
    // mean = 77.33 → converted is the same value on the 0–100 scale
    expect(result.get(2)?.rawScore).toBe(77.33);
    expect(result.get(2)?.convertedScore50).toBe(77.33);
  });

  it("computes each aspirant independently", () => {
    const result = computePostUtme([
      { userId: 1, bestScore: "50" },
      { userId: 2, bestScore: "90" },
    ]);
    expect(result.get(1)).toEqual({ rawScore: 50, convertedScore50: 50 });
    expect(result.get(2)).toEqual({ rawScore: 90, convertedScore50: 90 });
  });

  it("accepts numeric-string best scores from the DB driver", () => {
    const result = computePostUtme([{ userId: 5, bestScore: "55.6" }]);
    expect(result.get(5)?.rawScore).toBe(55.6);
  });

  it("omits users with no rows and handles empty input", () => {
    const empty = computePostUtme([]);
    expect(empty.size).toBe(0);

    const single = computePostUtme([{ userId: 3, bestScore: 40 }]);
    expect(single.size).toBe(1);
    expect(single.has(1)).toBe(false);
  });
});
