import { describe, expect, it } from "vitest";

import { computeCgpa } from "./cgpa";

describe("computeCgpa", () => {
  it("returns the unweighted mean of a user's scores on 5.00 scale", () => {
    const result = computeCgpa([
      { userId: 1, bestScore: 80 },
      { userId: 1, bestScore: 90 },
    ]);
    expect(result.get(1)).toBe(4.25);
  });

  it("rounds to 2 decimals", () => {
    const result = computeCgpa([
      { userId: 1, bestScore: 100 },
      { userId: 1, bestScore: 66 },
      { userId: 1, bestScore: 66 },
    ]);
    expect(result.get(1)).toBe(3.87);
  });

  it("computes each user independently", () => {
    const result = computeCgpa([
      { userId: 1, bestScore: "70" },
      { userId: 2, bestScore: "90" },
      { userId: 2, bestScore: "100" },
      { userId: 1, bestScore: "90" },
    ]);
    expect(result.get(1)).toBe(4);
    expect(result.get(2)).toBe(4.75);
  });

  it("accepts numeric-string best scores from the DB driver", () => {
    const result = computeCgpa([{ userId: 7, bestScore: "55.5" }]);
    expect(result.get(7)).toBe(2.78);
  });

  it("ignores rows of users not requested and omits users with no rows", () => {
    const result = computeCgpa([{ userId: 3, bestScore: 40 }]);
    expect(result.size).toBe(1);
    expect(result.has(1)).toBe(false);
  });

  it("returns an empty map for no rows", () => {
    expect(computeCgpa([]).size).toBe(0);
  });

  it("handles a single score", () => {
    const result = computeCgpa([{ userId: 9, bestScore: 72.5 }]);
    expect(result.get(9)).toBe(3.63);
  });

  it("clamps to 5.00 max and 0 min", () => {
    expect(computeCgpa([{ userId: 1, bestScore: 100 }]).get(1)).toBe(5);
    expect(computeCgpa([{ userId: 1, bestScore: 0 }]).get(1)).toBe(0);
  });
});
