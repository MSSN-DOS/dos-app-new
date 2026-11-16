import { describe, expect, it } from "vitest";
import { attemptDurationSeconds, quizScoreDistribution } from "./results";
describe("real result summaries", () => {
  it("counts inclusive/exclusive bucket boundaries without invalid scores", () => {
    expect(
      quizScoreDistribution([0, 19, 20, 39, 40, 59, 60, 79, 80, 100, NaN, -1, 101]).map(
        (bucket) => bucket.count,
      ),
    ).toEqual([2, 2, 2, 2, 2]);
  });
  it("derives durations only from valid completed attempt timestamps", () => {
    expect(
      attemptDurationSeconds(
        new Date("2026-11-16T09:00:00Z"),
        new Date("2026-11-16T09:05:20Z"),
      ),
    ).toBe(320);
    expect(attemptDurationSeconds(null, new Date())).toBeNull();
    expect(attemptDurationSeconds(new Date(1000), new Date(0))).toBeNull();
  });
});
