import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { departments } from "@/lib/db/schema";

const listQuerySchema = z.object({
  facultyId: z.coerce.number().int().min(1).optional(),
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
// Optional `?facultyId=` filter; writes stay admin-only under /api/admin/structure/*.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const { facultyId } = listQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );

    const rows = facultyId
      ? await getDb()
          .select()
          .from(departments)
          .where(eq(departments.facultyId, facultyId))
          .orderBy(asc(departments.name))
      : await getDb().select().from(departments).orderBy(asc(departments.name));

    return NextResponse.json({ data: rows });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
