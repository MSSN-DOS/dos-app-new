import { describe, expect, it } from "vitest";

import { parseBulkRows } from "./bulk-rows";

describe("parseBulkRows — fill_in_gap", () => {
  it("splits a row into body plus one answer per tab column", () => {
    const { rows } = parseBulkRows("Water boils at [gap]°C.\t100", "fill_in_gap");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "fill",
      line: 1,
      body: "Water boils at [gap]°C.",
      answers: ["100"],
      errors: [],
    });
  });

  it("treats extra tab columns as extra blanks", () => {
    const { rows } = parseBulkRows("A [gap] and a [gap].\tone\ttwo", "fill_in_gap");
    expect(rows[0]).toMatchObject({ answers: ["one", "two"], errors: [] });
  });

  it("flags a row with no answer column", () => {
    const { rows } = parseBulkRows("No answer here", "fill_in_gap");
    expect(rows[0].errors).toContain("Press Tab, then type the accepted answer");
  });

  it("flags an empty middle answer column", () => {
    const { rows } = parseBulkRows(`Q?\t\tB`, "fill_in_gap");
    expect(rows[0].errors).toContain("Answer 1 is empty");
  });

  it("flags an over-length answer", () => {
    const { rows } = parseBulkRows(`Q2?\t${"x".repeat(256)}`, "fill_in_gap");
    expect(rows[0].errors).toContain("Answer 1 over 255 characters");
  });

  it("skips blank lines and numbers rows by visible line", () => {
    const { rows } = parseBulkRows("\n  \nQ1?\ta\n\nQ2?\tb", "fill_in_gap");
    expect(rows.map((r) => r.line)).toEqual([1, 2]);
    expect(rows).toHaveLength(2);
  });

  it("caps at the batch limit and reports the ignored remainder", () => {
    const text = Array.from({ length: 53 }, (_, i) => `Q${i}?\ta`).join("\n");
    const { rows, ignored } = parseBulkRows(text, "fill_in_gap");
    expect(rows).toHaveLength(50);
    expect(ignored).toBe(3);
  });
});

describe("parseBulkRows — options", () => {
  it("parses options and marks the *-prefixed one correct", () => {
    const { rows } = parseBulkRows(
      "The SI unit of resistance is\t*Ohm\tAmpere\tVolt",
      "options",
    );
    expect(rows[0]).toMatchObject({ kind: "options", errors: [] });
    if (rows[0].kind !== "options") return;
    expect(rows[0].options).toEqual([
      { text: "Ohm", correct: true },
      { text: "Ampere", correct: false },
      { text: "Volt", correct: false },
    ]);
  });

  it("keeps * that is not at the start of a column as literal text", () => {
    const { rows } = parseBulkRows("Compute 2*3\t*6\t5", "options");
    if (rows[0].kind !== "options") return;
    expect(rows[0].body).toBe("Compute 2*3");
    expect(rows[0].options).toEqual([
      { text: "6", correct: true },
      { text: "5", correct: false },
    ]);
  });

  it("flags a row with fewer than two options", () => {
    const { rows } = parseBulkRows("Only one?\t*Lonely", "options");
    expect(rows[0].errors).toContain("Add at least two options (press Tab between them)");
  });

  it("flags a row with no correct marker", () => {
    const { rows } = parseBulkRows("Q?\tA\tB", "options");
    expect(rows[0].errors).toContain("Mark the correct option by starting it with *");
  });

  it("flags a row with more than one correct marker", () => {
    const { rows } = parseBulkRows("Q?\t*A\t*B", "options");
    expect(rows[0].errors).toContain("Only one option may be marked with *");
  });

  it("flags an option that is only the * marker", () => {
    const { rows } = parseBulkRows("Q?\t*\tB", "options");
    expect(rows[0].errors).toContain("Every option needs text");
  });

  it("flags over-length options", () => {
    const { rows } = parseBulkRows(`Q?\t*${"x".repeat(1001)}\tB`, "options");
    expect(rows[0].errors).toContain("Option 1 over 1,000 characters");
  });

  it("skips lines that are only tabs/whitespace", () => {
    const { rows } = parseBulkRows("\t\t\n   \nQ?\t*A\tB", "options");
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Q?");
  });
});
