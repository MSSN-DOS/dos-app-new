import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/api/response";
import { getDb } from "@/lib/db";
import { academicSessions } from "@/lib/db/schema";

export async function GET(request: Request) {
  try {
    await requireAuth(request, ["admin"]);
    const data = await getDb()
      .select({ id: academicSessions.id, label: academicSessions.label })
      .from(academicSessions)
      .orderBy(desc(academicSessions.label));
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
