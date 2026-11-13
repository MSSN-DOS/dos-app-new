import { describe, expect, it } from "vitest";

import {
  composeDurationSeconds,
  formatDurationSeconds,
  splitDurationSeconds,
} from "./duration";

describe("composeDurationSeconds", () => {
  it("combines hours, minutes and seconds", () => {
    expect(composeDurationSeconds({ hours: 1, minutes: 15, seconds: 30 })).toBe(4530);
  });

  it("treats an all-zero duration as zero, not invalid", () => {
    expect(composeDurationSeconds({ hours: 0, minutes: 0, seconds: 0 })).toBe(0);
  });

  it("accepts a seconds-only duration", () => {
    expect(composeDurationSeconds({ hours: 0, minutes: 0, seconds: 45 })).toBe(45);
  });

  it("rejects out-of-range minutes and seconds", () => {
    expect(composeDurationSeconds({ hours: 0, minutes: 60, seconds: 0 })).toBeNull();
    expect(composeDurationSeconds({ hours: 0, minutes: 0, seconds: 60 })).toBeNull();
    expect(composeDurationSeconds({ hours: 100, minutes: 0, seconds: 0 })).toBeNull();
  });

  it("rejects negative and fractional parts", () => {
    expect(composeDurationSeconds({ hours: -1, minutes: 0, seconds: 0 })).toBeNull();
    expect(composeDurationSeconds({ hours: 0, minutes: 1.5, seconds: 0 })).toBeNull();
  });
});

describe("splitDurationSeconds", () => {
  it("round-trips a composed duration", () => {
    const parts = { hours: 2, minutes: 5, seconds: 9 };
    expect(splitDurationSeconds(composeDurationSeconds(parts) ?? 0)).toEqual(parts);
  });

  it("normalises an empty or invalid value to zero parts", () => {
    expect(splitDurationSeconds(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(splitDurationSeconds(-30)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(splitDurationSeconds(12.5)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("formatDurationSeconds", () => {
  it("labels each unit that is non-zero", () => {
    expect(formatDurationSeconds(4530)).toBe("1h 15m 30s");
    expect(formatDurationSeconds(2700)).toBe("45m");
    expect(formatDurationSeconds(45)).toBe("45s");
  });

  it("reads as no limit when unset", () => {
    expect(formatDurationSeconds(0)).toBe("No time limit");
    expect(formatDurationSeconds(-1)).toBe("No time limit");
  });
});
