// Folder-path helper for content_items files (DESIGN.md §6):
//   Students: /resources/{faculty}/{department}/{level}/{semester}/{course}/
//   Aspirants: /resources/jamb/{subject}/
// Pure string shaping only — callers resolve the DB rows and pass names in.

export const RESOURCES_BUCKET = "resources";

export function slugifyPathSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function studentResourcePath(input: {
  faculty: string;
  department: string;
  level: string;
  semester: string;
  course: string;
}): string {
  return `resources/${[
    input.faculty,
    input.department,
    input.level,
    input.semester,
    input.course,
  ]
    .map(slugifyPathSegment)
    .join("/")}`;
}

export function aspirantResourcePath(input: { jambSubject: string }): string {
  return `resources/jamb/${slugifyPathSegment(input.jambSubject)}`;
}

export function resourceFilePath(folderPath: string, fileName: string): string {
  const safeName = fileName.replace(/[/\\]/g, "-");
  return `${folderPath}/${safeName}`;
}
