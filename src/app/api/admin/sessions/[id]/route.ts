import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { academicSessions } from "@/lib/db/schema/academic-sessions";
import { courses } from "@/lib/db/schema/courses";
import { semesterSettings } from "@/lib/db/schema/semester";
import { academicSessionUpdateSchema } from "@/lib/validation/academic-sessions";

function validationError(err: ZodError): NextResponse {
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();
    const [row] = await db
      .select({
        id: academicSessions.id,
        label: academicSessions.label,
        harmattanStart: academicSessions.harmattanStart,
        harmattanEnd: academicSessions.harmattanEnd,
        rainStart: academicSessions.rainStart,
        rainEnd: academicSessions.rainEnd,
      })
      .from(academicSessions)
      .where(eq(academicSessions.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = null;
    }
    const parsed = academicSessionUpdateSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    const db = getDb();
    const data = parsed.data;

    if (data.label !== undefined) {
      const [clash] = await db
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(and(eq(academicSessions.label, data.label), sql`${academicSessions.id} <> ${id}`))
        .limit(1);
      if (clash) {
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
    }

    const [row] = await db
      .update(academicSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(academicSessions.id, id))
      .returning({
        id: academicSessions.id,
        label: academicSessions.label,
        harmattanStart: academicSessions.harmattanStart,
        harmattanEnd: academicSessions.harmattanEnd,
        rainStart: academicSessions.rainStart,
        rainEnd: academicSessions.rainEnd,
      });

    if (!row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: row });
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

/**
 * DELETE — only a session nothing is attached to can go. Two references block it, and both
 * matter: courses (a course is an offering *in* a session, so deleting would orphan the row the
 * quizzes and content hang off) and the live manual override (deleting the session an override
 * points at would leave the whole portal filtered to nothing).
 *
 * Editing dates on a session in use is deliberately allowed — that is the point of the table.
 * Deleting one is a different act and is refused.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();

    const [session] = await db
      .select({ id: academicSessions.id, label: academicSessions.label })
      .from(academicSessions)
      .where(eq(academicSessions.id, id))
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 },
      );
    }

    const [courseRef] = await db
      .select({ code: courses.code })
      .from(courses)
      .where(eq(courses.sessionId, id))
      .limit(1);
    if (courseRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Session "${session.label}" still has courses in it (for example ${courseRef.code}). A course is one offering in one session, so deleting the session would orphan them. Delete or move those courses first.`,
          },
        },
        { status: 409 },
      );
    }

    const [overrideRef] = await db
      .select({ id: semesterSettings.id })
      .from(semesterSettings)
      .where(eq(semesterSettings.manualOverrideSessionId, id))
      .limit(1);
    if (overrideRef) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Session "${session.label}" is the current manual override. Switch the semester setting back to auto, or point it at another session, first.`,
          },
        },
        { status: 409 },
      );
    }

    const deleted = await db
      .delete(academicSessions)
      .where(eq(academicSessions.id, id))
      .returning({ id: academicSessions.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { id } });
  } catch (error) {
    // The FK on courses.session_id is ON DELETE NO ACTION, so a race (a course created between
    // the check above and this delete) surfaces as 23503 rather than silently orphaning.
    if (error instanceof Error && "code" in error && error.code === "23503") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "That session was given a course while you were deleting it. Reload and try again.",
          },
        },
        { status: 409 },
      );
    }
    console.error(error);
    return errorResponse(error);
  }
}
