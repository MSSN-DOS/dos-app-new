import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  aspirantProfiles,
  departments,
  postUtmeScores,
  roles,
  users,
} from "@/lib/db/schema";
import { aspirantListQuerySchema } from "@/lib/validation/users";

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

/** GET /api/admin/users/aspirants?search= */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const url = new URL(request.url);
    const pagination = parsePagination(url.searchParams);
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }
    const query = aspirantListQuerySchema.safeParse({
      search: url.searchParams.get("search") ?? undefined,
    });
    if (!query.success) return validationError(query.error);

    const conditions = [eq(roles.name, "aspirant")];
    const search = query.data.search;
    if (search !== undefined && search.length > 0) {
      const pattern = `%${search}%`;
      const searchCondition = or(ilike(users.fullName, pattern), ilike(users.identifier, pattern));
      if (searchCondition) conditions.push(searchCondition);
    }

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        aspirationDepartment: departments.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(aspirantProfiles, eq(aspirantProfiles.userId, users.id))
      .leftJoin(departments, eq(aspirantProfiles.aspirationDepartmentId, departments.id))
      .where(and(...conditions))
      .orderBy(asc(users.fullName));

    // Latest Post-UTME converted score per listed aspirant (last row per user
    // after ordering by week — same flat-rows approach as the students list).
    const latestScore = new Map<number, string>();
    if (rows.length > 0) {
      const scores = await db
        .select({
          userId: postUtmeScores.userId,
          weekStart: postUtmeScores.weekStart,
          convertedScore50: postUtmeScores.convertedScore50,
        })
        .from(postUtmeScores)
        .where(inArray(postUtmeScores.userId, rows.map((r) => r.id)))
        .orderBy(asc(postUtmeScores.userId), asc(postUtmeScores.weekStart));
      for (const s of scores) latestScore.set(s.userId, s.convertedScore50);
    }

    const data = rows.map((row) => ({
      ...row,
      latestPostUtme: latestScore.get(row.id) ?? null,
    }));
    return NextResponse.json(paginate(data, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}
