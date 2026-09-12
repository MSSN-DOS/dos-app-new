import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const heldQuerySchema = z.object({
  week: z.string().regex(dateRe, "week must be a YYYY-MM-DD date").optional(),
});

/** Either release one quiz's held attempts, or every quiz in a week. */
export const releaseSchema = z.union([
  z.object({ quizId: z.coerce.number().int().min(1) }).strict(),
  z.object({ weekStart: z.string().regex(dateRe, "weekStart must be a YYYY-MM-DD date") }).strict(),
]);

export type ReleaseInput = z.infer<typeof releaseSchema>;

/** GET /api/admin/leaderboard — track is required, week defaults to most recent released. */
export const leaderboardQuerySchema = z.object({
  track: z.enum(["student", "aspirant"]),
  week: z.string().regex(dateRe, "week must be a YYYY-MM-DD date").optional(),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
