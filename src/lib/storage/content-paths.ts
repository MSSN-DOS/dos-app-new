// Folder-path helper for content_items files (DESIGN.md §6):
//   Students: /resources/{faculty}/{department}/{level}/{session}/{semester}/{course}/
//   Aspirants: /resources/jamb/{subject}/
// Pure string shaping only — callers resolve the DB rows and pass names in.
//
// The {session} segment arrived with academic_sessions (2026-09-30). It is load-bearing, not
// decoration: `courses` is one row per offering, so the same course code exists once per
// session, and without the year segment a 2026/27 upload would overwrite the 2025/26 file at
// the same key. content_items stores the path on the row, so objects uploaded before this
// segment keep their old key and keep resolving.

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
  /** Session label, e.g. `2025/26` — slugs to `2025-26`. */
  session: string;
  semester: string;
  course: string;
}): string {
  return `resources/${[
    input.faculty,
    input.department,
    input.level,
    input.session,
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
  // Collapsing separators to `-` is what makes this safe, and it is worth being explicit about
  // why: every traversal form — `../`, `..\`, an absolute path — depends on a separator to
  // escape the folder, so removing separators removes the traversal with it. `../../etc/passwd`
  // becomes the literal single segment `..-..-etc-passwd`, which climbs nothing.
  //
  // The separator mapping must NOT be "improved" into anything that rewrites dot runs, because
  // `content_items` stores the resulting path on the row and serves signed URLs from it. Changing
  // the shape would orphan every object already uploaded.
  //
  // One form survives intact: a name made *only* of dots. It cannot traverse (there is no
  // separator left to continue a climb with), but it would emit a key ending in `/`, so it gets
  // a fixed name instead.
  const flattened = fileName.replace(/[/\\]/g, "-");
  const safeName = /^\.*$/.test(flattened) ? "unnamed-file" : flattened;
  return `${folderPath}/${safeName}`;
}
