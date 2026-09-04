import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizAttempts, roles, users } from "@/lib/db/schema";

/** GET /api/admin/dashboard — aggregate counts + pending score releases. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const countByRole = async (role: "student" | "aspirant" | "teacher"): Promise<number> => {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(roles.name, role))
        .orderBy(asc(users.id));
      return rows.length;
    };

    // Held attempts: submitted but not yet released (feeds the release queue).
    const held = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(isNotNull(quizAttempts.submittedAt), isNull(quizAttempts.releasedAt)))
      .orderBy(asc(quizAttempts.id));

    const [students, aspirants, teachers] = await Promise.all([
      countByRole("student"),
      countByRole("aspirant"),
      countByRole("teacher"),
    ]);

    return NextResponse.json({
      counts: { students, aspirants, teachers },
      pendingReleases: held.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
