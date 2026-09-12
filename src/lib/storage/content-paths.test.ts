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
  it("matches the DESIGN.md §6 shape: faculty/department/level/semester/course", () => {
    expect(
      studentResourcePath({
        faculty: "Science",
        department: "Mathematics",
        level: "100",
        semester: "harmattan",
        course: "MAT 101",
      }),
    ).toBe("resources/science/mathematics/100/harmattan/mat-101");
  });

  it("slugs each segment", () => {
    expect(
      studentResourcePath({
        faculty: "Faculty of Science",
        department: "Dept. of Chemistry",
        level: "200 Level",
        semester: "Rain Semester",
        course: "CHE 301",
      }),
    ).toBe("resources/faculty-of-science/dept-of-chemistry/200-level/rain-semester/che-301");
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
