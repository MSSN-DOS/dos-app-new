import { z } from "zod";

// Scope rule mirrors the DB `content_items_track_check`: exactly one of
// course_id / jamb_subject_id — never both, never neither (DESIGN.md §6).
export const contentScopeSchema = z
  .object({
    courseId: z.coerce.number().int().positive().optional(),
    jambSubjectId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    const hasCourse = val.courseId !== undefined;
    const hasSubject = val.jambSubjectId !== undefined;
    if (hasCourse === hasSubject) {
      ctx.addIssue({
        code: "custom",
        message:
          "Pick exactly one scope: a course (student track) or a JAMB subject (aspirant track)",
      });
    }
  });

export const articleCreateSchema = contentScopeSchema.extend({
  type: z.literal("article"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
});

// PDF metadata comes from multipart form fields; the File itself is checked
// at the route boundary (content-type + size), not here.
export const pdfMetaSchema = contentScopeSchema.extend({
  type: z.literal("pdf"),
  title: z.string().trim().min(1).max(200),
});

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}
