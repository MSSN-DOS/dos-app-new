import { describe, expect, it } from "vitest";

import { filterOptions, groupOptions, type StructureOption } from "./structure-options";

const OPTIONS: StructureOption[] = [
  { id: 1, label: "Agriculture", group: "Faculty of Agriculture" },
  { id: 2, label: "Agricultural Economics", group: "Faculty of Agriculture" },
  { id: 3, label: "Computer Science", group: "Faculty of Physical Sciences" },
  { id: 4, label: "Mechanical Engineering", group: "Faculty of Engineering" },
  { id: 5, label: "Electrical Engineering", group: "Faculty of Engineering" },
  { id: 6, label: "Medicine and Surgery" },
];

describe("filterOptions", () => {
  it("returns every option for an empty or whitespace-only query", () => {
    expect(filterOptions(OPTIONS, "")).toHaveLength(OPTIONS.length);
    expect(filterOptions(OPTIONS, "   ")).toHaveLength(OPTIONS.length);
  });

  it("matches the department name case-insensitively", () => {
    expect(filterOptions(OPTIONS, "computer").map((option) => option.id)).toEqual([3]);
    expect(filterOptions(OPTIONS, "COMPUTER").map((option) => option.id)).toEqual([3]);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(filterOptions(OPTIONS, "  computer  ").map((option) => option.id)).toEqual([
      3,
    ]);
  });

  it("matches the faculty name, so searching a faculty surfaces its departments", () => {
    expect(filterOptions(OPTIONS, "engineering").map((option) => option.id)).toEqual([
      4, 5,
    ]);
  });

  it("keeps options without a group searchable by name only", () => {
    expect(filterOptions(OPTIONS, "medicine").map((option) => option.id)).toEqual([6]);
    expect(filterOptions(OPTIONS, "faculty").map((option) => option.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("returns nothing when neither the label nor the group matches", () => {
    expect(filterOptions(OPTIONS, "law")).toEqual([]);
  });
});

describe("groupOptions", () => {
  it("collapses consecutive options that share a group into one section", () => {
    const sections = groupOptions(OPTIONS);
    expect(sections.map((section) => section.group)).toEqual([
      "Faculty of Agriculture",
      "Faculty of Physical Sciences",
      "Faculty of Engineering",
      null,
    ]);
    expect(sections[0].options.map((option) => option.id)).toEqual([1, 2]);
  });

  it("never reorders options, so a repeated group appears as a second section", () => {
    const sections = groupOptions([OPTIONS[0], OPTIONS[3], OPTIONS[1]]);
    expect(sections.map((section) => section.group)).toEqual([
      "Faculty of Agriculture",
      "Faculty of Engineering",
      "Faculty of Agriculture",
    ]);
  });

  it("returns an empty list for no options", () => {
    expect(groupOptions([])).toEqual([]);
  });
});
