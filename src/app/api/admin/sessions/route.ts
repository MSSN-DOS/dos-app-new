import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { academicSessions } from "@/lib/db/schema/academic-sessions";
import { academicSessionCreateSchema } from "@/lib/validation/academic-sessions";

export function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "body",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

/**
 * GET /api/admin/sessions — every academic session, oldest first. Admin-only: the session
 * calendar decides which half of the portal a student can see, so it is not public knowledge.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const db = getDb();

    const data = await db
      .select({
        id: academicSessions.id,
        label: academicSessions.label,
        harmattanStart: academicSessions.harmattanStart,
        harmattanEnd: academicSessions.harmattanEnd,
        rainStart: academicSessions.rainStart,
        rainEnd: academicSessions.rainEnd,
      })
      .from(academicSessions)
      .orderBy(academicSessions.harmattanStart);

    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}

/**
 * POST — create a session. Conflicts on a duplicate label are turned into a readable 409
 * rather than a raw 23505, because "2026/27 already exists" is the only thing an Admin can
 * act on and the unique index is a concurrency guard, not a validation rule.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = null;
    }
    const parsed = academicSessionCreateSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    const db = getDb();
    const data = parsed.data;

    // Pre-check the label so the common case (a typo'd duplicate, submitted by one Admin) gets
    // a plain 409. The unique index below is still the real guarantee — two Admins saving
    // 2026/27 at the same moment both pass this check and one loses, which is why the insert
    // also handles 23505.
    const [existing] = await db
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(eq(academicSessions.label, data.label))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Session "${data.label}" already exists`,
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(academicSessions)
      .values({ ...data, updatedAt: new Date() })
      .returning({
        id: academicSessions.id,
        label: academicSessions.label,
        harmattanStart: academicSessions.harmattanStart,
        harmattanEnd: academicSessions.harmattanEnd,
        rainStart: academicSessions.rainStart,
        rainEnd: academicSessions.rainEnd,
      });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "A session with that label already exists",
          },
        },
        { status: 409 },
      );
    }
    console.error(error);
    return errorResponse(error);
  }
}
