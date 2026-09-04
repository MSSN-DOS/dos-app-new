import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { faculties } from "@/lib/db/schema";

// Read-only structure lookups for any authenticated user (onboarding option lists).
// Writes stay admin-only under /api/admin/structure/*.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
    const rows = await getDb().select().from(faculties).orderBy(asc(faculties.name));
    return NextResponse.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
