import { z } from "zod";

import { parseVideoLink } from "@/lib/content/video-link";

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

// Video entries are a link, not an upload: nothing lands in Supabase Storage. The URL is
// validated through the shared parser so the server and the form agree on what a usable
// link is, and so `javascript:`/`data:` URLs are rejected before they can be stored and
// rendered as an href.
export const videoCreateSchema = contentScopeSchema
  .extend({
    type: z.literal("video"),
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().min(1).max(2000),
  })
  .superRefine((val, ctx) => {
    const parsed = parseVideoLink(val.url);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", path: ["url"], message: parsed.message });
    }
  });

// Editing is deliberately limited to the title and the link. Re-scoping an existing item
// would need the course XOR subject rule re-checked against a partial update; deleting and
// re-adding is clearer than a half-updated scope.
export const videoUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().min(1).max(2000),
  })
  .strict()
  .superRefine((val, ctx) => {
    const parsed = parseVideoLink(val.url);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", path: ["url"], message: parsed.message });
    }
  });
