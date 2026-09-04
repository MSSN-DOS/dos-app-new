import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { departmentLevels, levels } from "@/lib/db/schema";
import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";

const listQuerySchema = z.object({
  departmentId: z.coerce.number().int().min(1).optional(),
});

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

// Read-only structure lookups for any authenticated user (onboarding option lists).
// Optional `?departmentId=` filter (levels linked to that department via
// department_levels); writes stay admin-only under /api/admin/structure/*.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const { departmentId } = listQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );

    if (!departmentId) {
      const rows = await getDb()
        .select()
        .from(levels)
        .orderBy(asc(levels.value));
      return NextResponse.json({ data: rows });
    }

    const rows = await getDb()
      .select({
        id: levels.id,
        value: levels.value,
      })
      .from(levels)
      .innerJoin(departmentLevels, eq(departmentLevels.levelId, levels.id))
      .where(eq(departmentLevels.departmentId, departmentId))
      .orderBy(asc(levels.value));
    return NextResponse.json({ data: rows });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
