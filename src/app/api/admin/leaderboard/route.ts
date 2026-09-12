import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  cgpaRecords,
  postUtmeScores,
} from "@/lib/db/schema/performance";
import { leaderboardQuerySchema } from "@/lib/validation/scores";

function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "query",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

/**
 * GET /api/admin/leaderboard?track=student|aspirant&week=YYYY-MM-DD
 * Rankings never merge (DESIGN.md §5). Only released weeks are ever queried —
 * cgpa_records / post_utme_scores rows only exist after an Admin release.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const query = leaderboardQuerySchema.safeParse({
      track: new URL(request.url).searchParams.get("track") ?? undefined,
      week: new URL(request.url).searchParams.get("week") ?? undefined,
    });
    if (!query.success) return validationError(query.error);
    const { track, week } = query.data;

    if (track === "student") {
      const weekRows = await db
        .select({ weekStart: cgpaRecords.weekStart })
        .from(cgpaRecords)
        .orderBy(desc(cgpaRecords.weekStart));
      const weeks = [...new Set(weekRows.map((r) => r.weekStart))];
      const targetWeek = week ?? weeks[0];
      if (!targetWeek)
        return NextResponse.json({ data: [], weeks, week: null });

      const rows = await db
        .select({
          userId: cgpaRecords.userId,
          fullName: users.fullName,
          score: cgpaRecords.cgpaValue,
        })
        .from(cgpaRecords)
        .innerJoin(users, eq(cgpaRecords.userId, users.id))
        .where(eq(cgpaRecords.weekStart, targetWeek))
        .orderBy(desc(cgpaRecords.cgpaValue), asc(users.fullName));

      return NextResponse.json({
        data: rows.map((row, index) => {
          const raw = Number(row.score);
          const score = raw > 5 ? Math.round((Math.min(5, raw / 20) * 100)) / 100 : raw;
          return {
            rank: index + 1,
            userId: row.userId,
            name: row.fullName,
            score,
          };
        }),
        weeks,
        week: targetWeek,
      });
    }

    const weekRows = await db
      .select({ weekStart: postUtmeScores.weekStart })
      .from(postUtmeScores)
      .orderBy(desc(postUtmeScores.weekStart));
    const weeks = [...new Set(weekRows.map((r) => r.weekStart))];
    const targetWeek = week ?? weeks[0];
    if (!targetWeek) return NextResponse.json({ data: [], weeks, week: null });

    const rows = await db
      .select({
        userId: postUtmeScores.userId,
        fullName: users.fullName,
        score: postUtmeScores.convertedScore50,
      })
      .from(postUtmeScores)
      .innerJoin(users, eq(postUtmeScores.userId, users.id))
      .where(eq(postUtmeScores.weekStart, targetWeek))
      .orderBy(desc(postUtmeScores.convertedScore50), asc(users.fullName));

    return NextResponse.json({
      data: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.fullName,
        score: Number(row.score),
      })),
      weeks,
      week: targetWeek,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
