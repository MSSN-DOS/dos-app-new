import { describe, expect, it } from "vitest";

import {
  RESOURCES_BUCKET,
  aspirantResourcePath,
  resourceFilePath,
  slugifyPathSegment,
  studentResourcePath,
} from "./content-paths";

describe("slugifyPathSegment", () => {
  it("lowercases and hyphenates names", () => {
    expect(slugifyPathSegment("Faculty of Science")).toBe("faculty-of-science");
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugifyPathSegment("Chem  &   Bio")).toBe("chem-bio");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyPathSegment("--Physics!--")).toBe("physics");
  });
});

describe("studentResourcePath", () => {
  it("matches the DESIGN.md §6 shape: faculty/department/level/session/semester/course", () => {
    expect(
      studentResourcePath({
        faculty: "Science",
        department: "Mathematics",
        level: "100",
        session: "2025/26",
        semester: "harmattan",
        course: "MAT 101",
      }),
    ).toBe("resources/science/mathematics/100/2025-26/harmattan/mat-101");
  });

  it("slugs each segment", () => {
    expect(
      studentResourcePath({
        faculty: "Faculty of Science",
        department: "Dept. of Chemistry",
        level: "200 Level",
        session: "2026/27",
        semester: "Rain Semester",
        course: "CHE 301",
      }),
    ).toBe(
      "resources/faculty-of-science/dept-of-chemistry/200-level/2026-27/rain-semester/che-301",
    );
  });

  it("keeps the session segment, so the same course code in two sessions is two objects", () => {
    // The reason the session is in the key at all: a course is one row per offering, so
    // CSC 201 exists once for 2025/26 and again for 2026/27. Without the year segment the
    // second session's upload would overwrite the first at the same object key.
    const in2025 = studentResourcePath({
      faculty: "Science",
      department: "Computing",
      level: "200",
      session: "2025/26",
      semester: "harmattan",
      course: "CSC 201",
    });
    const in2026 = studentResourcePath({
      faculty: "Science",
      department: "Computing",
      level: "200",
      session: "2026/27",
      semester: "harmattan",
      course: "CSC 201",
    });
    expect(in2025).not.toBe(in2026);
  });
});

describe("aspirantResourcePath", () => {
  it("matches the DESIGN.md §6 shape: jamb/subject", () => {
    expect(aspirantResourcePath({ jambSubject: "Use of English" })).toBe(
      "resources/jamb/use-of-english",
    );
  });
});

describe("resourceFilePath", () => {
  it("appends the file name to the folder path", () => {
    expect(resourceFilePath("resources/jamb/physics", "formula-sheet.pdf")).toBe(
      "resources/jamb/physics/formula-sheet.pdf",
    );
  });

  it("strips path separators from the file name", () => {
    expect(resourceFilePath("resources/x/y", "../../etc/passwd.pdf")).toBe(
      "resources/x/y/..-..-etc-passwd.pdf",
    );
  });

  it("exposes the bucket name", () => {
    expect(RESOURCES_BUCKET).toBe("resources");
  });
});
