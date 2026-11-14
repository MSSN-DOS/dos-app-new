import { describe, expect, it } from "vitest";
import { filterQuizSettings, scheduleDateValue, scheduleInputValue } from "./settings";
describe("settings search and scheduling", () => {
  it("searches descriptions and groups case-insensitively", () => {
    expect(
      filterQuizSettings("  SCORING ").every((s) => s.group === "Scoring & results"),
    ).toBe(true);
    expect(filterQuizSettings("windows").map((s) => s.key)).toContain("permitFocusLoss");
  });
  it("round-trips WAT dates independently of the device timezone", () => {
    expect(scheduleDateValue("2026-11-20T10:30")?.toISOString()).toBe(
      "2026-11-20T09:30:00.000Z",
    );
    expect(scheduleInputValue(new Date("2026-11-20T09:30:00Z"))).toBe("2026-11-20T10:30");
    expect(scheduleDateValue("")).toBeNull();
  });
});
