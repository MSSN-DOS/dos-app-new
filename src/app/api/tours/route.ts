import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { tourCompletions } from "@/lib/db/schema";

const tourKeyShape = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9.-]+$/, "Invalid tour key");

function validationError(details: { field: string; code: string; message: string }[]) {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details,
      },
    },
    { status: 422 },
  );
}

function readTourKey(raw: unknown): { ok: true; value: string } | { ok: false } {
  const parsed = z.object({ tourKey: tourKeyShape }).safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: true, value: parsed.data.tourKey };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const raw = url.searchParams.get("tourKey");
    const result = readTourKey(raw === null ? { tourKey: "" } : { tourKey: raw });
    if (!result.ok) {
      return validationError([
        { field: "tourKey", code: "custom", message: "tourKey query parameter is required" },
      ]);
    }

    const db = getDb();
    const [row] = await db
      .select({ tourKey: tourCompletions.tourKey })
      .from(tourCompletions)
      .where(and(eq(tourCompletions.userId, auth.userId), eq(tourCompletions.tourKey, result.value)))
      .limit(1);

    return NextResponse.json({ data: { seen: Boolean(row) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }
    const result = readTourKey(body);
    if (!result.ok) {
      return validationError([
        { field: "tourKey", code: "custom", message: "A valid tourKey is required" },
      ]);
    }

    const db = getDb();
    await db
      .insert(tourCompletions)
      .values({ userId: auth.userId, tourKey: result.value })
      .onConflictDoNothing();

    return NextResponse.json({ data: { seen: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
