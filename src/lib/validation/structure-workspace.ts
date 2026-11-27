import { z } from "zod";
export const structureKind = z.enum([
  "faculty",
  "department",
  "level",
  "course",
  "topic",
]);
export type StructureKind = z.infer<typeof structureKind>;
export const workspaceQuerySchema = z
  .object({
    mode: z.enum(["root", "branch", "search", "record"]).default("root"),
    kind: structureKind.default("course"),
    id: z.coerce.number().int().positive().optional(),
    sessionId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    q: z.string().trim().max(200).default(""),
  })
  .superRefine((query, ctx) => {
    if (
      query.mode === "record" &&
      (!query.id || !["course", "topic"].includes(query.kind))
    )
      ctx.addIssue({ code: "custom", path: ["id"], message: "Choose a course or topic" });
    if (
      query.mode === "branch" &&
      (query.kind === "topic" || (query.kind !== "course" && !query.id))
    )
      ctx.addIssue({ code: "custom", path: ["kind"], message: "Choose a valid branch" });
  });
export const workspaceOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("copy"),
    courseId: z.number().int().positive(),
    sessionId: z.number().int().positive(),
    includeTopics: z.boolean(),
  }),
  z.object({
    action: z.literal("bulkTopics"),
    courseId: z.number().int().positive(),
    titles: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  }),
]);
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;
export type WorkspaceOperation = z.infer<typeof workspaceOperationSchema>;
