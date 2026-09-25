import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  contentItems,
  courses,
  jambSubjects,
  questions,
  quizzes,
  roles,
  teacherSubjects,
  topics,
  tourCompletions,
  users,
} from "@/lib/db/schema";
import { teacherUpdateSchema } from "@/lib/validation/teachers";

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

/**
 * PATCH /api/admin/teachers/[id]
 *
 * Edits a Teacher's name and/or assigned subjects, and carries the deactivate/reactivate
 * toggle. Hard deletion is DELETE /[id], not this endpoint (DESIGN.md §7).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const data = teacherUpdateSchema.parse(await request.json());
    const db = getDb();

    // Confirm the target really is a Teacher. Without this the endpoint would happily flip
    // is_active on any user id handed to it — a student, an aspirant, an admin.
    const [target] = await db
      .select({ id: users.id, roleName: roles.name })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!target || target.roleName !== "teacher") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Teacher not found" } },
        { status: 404 },
      );
    }

    const touchesAssignments = data.courseIds !== undefined;
    const courseIds = [...new Set(data.courseIds ?? [])];
    const jambSubjectIds = [...new Set(data.jambSubjectIds ?? [])];

    if (touchesAssignments) {
      if (courseIds.length > 0) {
        const found = await db
          .select({ id: courses.id })
          .from(courses)
          .where(inArray(courses.id, courseIds))
          .orderBy(asc(courses.id));
        if (found.length !== courseIds.length) {
          return NextResponse.json(
            { error: { code: "NOT_FOUND", message: "One or more courses were not found" } },
            { status: 404 },
          );
        }
      }
      if (jambSubjectIds.length > 0) {
        const found = await db
          .select({ id: jambSubjects.id })
          .from(jambSubjects)
          .where(inArray(jambSubjects.id, jambSubjectIds))
          .orderBy(asc(jambSubjects.id));
        if (found.length !== jambSubjectIds.length) {
          return NextResponse.json(
            { error: { code: "NOT_FOUND", message: "One or more JAMB subjects were not found" } },
            { status: 404 },
          );
        }
      }
    }

    const set: { fullName?: string; isActive?: boolean } = {};
    if (data.fullName !== undefined) set.fullName = data.fullName;
    if (data.isActive !== undefined) set.isActive = data.isActive;

    const holder: {
      row?: {
        id: number;
        fullName: string;
        identifier: string;
        isActive: boolean;
      };
    } = {};

    await db.transaction(async (tx) => {
      if (Object.keys(set).length > 0) {
        const [row] = await tx
          .update(users)
          .set(set)
          .where(eq(users.id, id))
          .returning({
            id: users.id,
            fullName: users.fullName,
            identifier: users.identifier,
            isActive: users.isActive,
          });
        holder.row = row;
      }

      if (touchesAssignments) {
        await tx.delete(teacherSubjects).where(eq(teacherSubjects.userId, id));
        const values = [
          ...courseIds.map((courseId) => ({ userId: id, courseId, jambSubjectId: null })),
          ...jambSubjectIds.map((jambSubjectId) => ({
            userId: id,
            courseId: null,
            jambSubjectId,
          })),
        ];
        if (values.length > 0) {
          await tx.insert(teacherSubjects).values(values);
        }
      }
    });

    if (!holder.row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Teacher not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(holder.row);
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}

/**
 * DELETE /api/admin/teachers/[id]
 *
 * Hard-deletes a Teacher account. Blocked while the account owns authored content (quizzes,
 * questions, topics, content items) — those FKs have no cascade, and deleting the account
 * would orphan the authorship. The confirm gate tells the Admin what blocks the delete.
 *
 * Inside the transaction the account's throwaway onboarding-tour rows are removed first (that
 * FK is restrict and there's no reason to keep them), then the user row — its subject
 * assignments and sessions cascade.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid id" } },
        { status: 400 },
      );
    }

    const db = getDb();

    // Confirm the target really is a Teacher, exactly like PATCH — never delete another role
    // because a caller picked a numeric id.
    const [target] = await db
      .select({ id: users.id, roleName: roles.name })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!target || target.roleName !== "teacher") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Teacher not found" } },
        { status: 404 },
      );
    }

    // Block while the account owns authored content. The FKs below have no cascade, so a raw
    // delete would fail anyway — this returns a readable reason that names what blocks it.
    const [quizRef] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.createdBy, id))
      .limit(1);
    const [questionRef] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.createdBy, id))
      .limit(1);
    const [topicRef] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.createdBy, id))
      .limit(1);
    const [contentRef] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(eq(contentItems.uploadedBy, id))
      .limit(1);

    const blockers = [
      quizRef ? "quizzes" : null,
      questionRef ? "questions" : null,
      topicRef ? "topics" : null,
      contentRef ? "content items" : null,
    ].filter((x): x is string => x !== null);

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Delete blocked: this teacher has authored ${blockers.join(", ")}. Delete that content first, or Deactivate instead.`,
          },
        },
        { status: 409 },
      );
    }

    const holder: { row?: { id: number; fullName: string; identifier: string } } = {};
    await db.transaction(async (tx) => {
      await tx.delete(tourCompletions).where(eq(tourCompletions.userId, id));
      const [row] = await tx
        .delete(users)
        .where(eq(users.id, id))
        .returning({ id: users.id, fullName: users.fullName, identifier: users.identifier });
      holder.row = row;
    });

    if (!holder.row) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Teacher not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
