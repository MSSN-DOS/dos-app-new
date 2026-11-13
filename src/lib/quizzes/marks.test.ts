import { describe, expect, it } from "vitest";

import { distributeMarks, sumMarks } from "./marks";

describe("distributeMarks", () => {
  it("splits evenly when the total divides cleanly", () => {
    const result = distributeMarks(10, 5);
    expect(result).toEqual({ ok: true, marks: [2, 2, 2, 2, 2] });
  });

  it("hands the remainder to the earliest questions", () => {
    expect(distributeMarks(10, 3)).toEqual({ ok: true, marks: [4, 3, 3] });
    expect(distributeMarks(10, 4)).toEqual({ ok: true, marks: [3, 3, 2, 2] });
  });

  it("preserves the total exactly", () => {
    for (const total of [1, 7, 50, 99, 100]) {
      for (const count of [1, 2, 3, 8, 25]) {
        if (total < count) continue;
        const result = distributeMarks(total, count);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(sumMarks(result.marks)).toBe(total);
          expect(result.marks).toHaveLength(count);
        }
      }
    }
  });

  it("gives every question one mark when the total equals the count", () => {
    expect(distributeMarks(6, 6)).toEqual({ ok: true, marks: [1, 1, 1, 1, 1, 1] });
  });

  it("rejects a total below the question count instead of minting 0-mark questions", () => {
    expect(distributeMarks(3, 5)).toEqual({ ok: false, reason: "total-below-count" });
  });

  it("rejects a non-positive or fractional total", () => {
    expect(distributeMarks(0, 3)).toEqual({ ok: false, reason: "invalid-total" });
    expect(distributeMarks(-5, 3)).toEqual({ ok: false, reason: "invalid-total" });
    expect(distributeMarks(7.5, 3)).toEqual({ ok: false, reason: "invalid-total" });
  });

  it("rejects an empty quiz", () => {
    expect(distributeMarks(10, 0)).toEqual({ ok: false, reason: "no-questions" });
    expect(distributeMarks(10, 2.5)).toEqual({ ok: false, reason: "no-questions" });
  });
});

describe("sumMarks", () => {
  it("totals an empty list as zero", () => {
    expect(sumMarks([])).toBe(0);
  });

  it("totals per-question marks", () => {
    expect(sumMarks([4, 3, 3])).toBe(10);
  });
});
