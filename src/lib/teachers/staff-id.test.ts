import { describe, expect, it } from "vitest";

import { formatStaffId, isStaffId, nextStaffId, nextStaffNumber } from "./staff-id";

describe("formatStaffId", () => {
  it("zero-pads to three digits", () => {
    expect(formatStaffId(1)).toBe("STF-001");
    expect(formatStaffId(42)).toBe("STF-042");
    expect(formatStaffId(999)).toBe("STF-999");
  });

  it("keeps growing past the padding rather than truncating", () => {
    expect(formatStaffId(1000)).toBe("STF-1000");
  });
});

describe("nextStaffNumber", () => {
  it("starts at 1 when nothing exists", () => {
    expect(nextStaffNumber([])).toBe(1);
  });

  it("continues from the highest existing number", () => {
    expect(nextStaffNumber(["STF-001", "STF-002"])).toBe(3);
    expect(nextStaffNumber(["STF-002", "STF-009", "STF-004"])).toBe(10);
  });

  it("ignores identifiers that aren't STF-<digits>", () => {
    // The old create form accepted any 1-50 char string, so rows like these really exist.
    // They must not stop the sequence, and they must not be read as the highest number.
    expect(nextStaffId(["STF-004", "ABC-123", "staff", "STF-x", ""])).toBe("STF-005");
  });

  it("returns 1 when nothing parseable is present", () => {
    expect(nextStaffNumber(["ABC-123", "STF-", "5"])).toBe(1);
  });

  it("tolerates surrounding whitespace", () => {
    expect(nextStaffNumber(["  STF-007  "])).toBe(8);
  });

  it("does not read a numeric suffix from a longer id", () => {
    // "XSTF-004" must not count as 4 — the pattern is anchored.
    expect(nextStaffNumber(["XSTF-004", "STF-004-extra"])).toBe(1);
  });
});

describe("isStaffId", () => {
  it("accepts generated ids", () => {
    expect(isStaffId("STF-001")).toBe(true);
  });

  it("rejects hand-typed legacy ids", () => {
    expect(isStaffId("STF-014-A")).toBe(false);
    expect(isStaffId("Ibrahim")).toBe(false);
  });
});
