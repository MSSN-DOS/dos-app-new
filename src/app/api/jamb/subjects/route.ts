import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { jambSubjects } from "@/lib/db/schema";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
    const db = getDb();
    const rows = await db
      .select({ id: jambSubjects.id, name: jambSubjects.name })
      .from(jambSubjects)
      .orderBy(asc(jambSubjects.name));
    return NextResponse.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
