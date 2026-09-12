import { NextResponse } from "next/server";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  contentItems,
  courses,
  courseFaculties,
  departments,
  jambSubjects,
  roles,
} from "@/lib/db/schema";
import { studentProfiles } from "@/lib/db/schema/profiles";
import { z } from "zod";
import { errorResponse } from "@/lib/api/response";
import { getActiveSemester } from "@/lib/semester";
import { createResourceSignedUrl } from "@/lib/storage/supabase-storage";

const querySchema = z.object({
  courseId: z.coerce.number().int().min(1).optional(),
  jambSubjectId: z.coerce.number().int().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    const db = getDb();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      courseId: url.searchParams.get("courseId") ?? undefined,
      jambSubjectId: url.searchParams.get("jambSubjectId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join(".") || "query",
              code: i.code,
              message: i.message,
            })),
          },
        },
        { status: 422 },
      );
    }
    const courseIdFilter = parsed.data.courseId;
    const subjectIdFilter = parsed.data.jambSubjectId;

    const [roleRow] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, auth.roleId))
      .orderBy(asc(roles.id))
      .limit(1);
    const roleName = roleRow?.name ?? "";

    if (roleName === "aspirant") {
      const conds = [];
      if (subjectIdFilter !== undefined) {
        conds.push(eq(contentItems.jambSubjectId, subjectIdFilter));
      }
      const rows = await db
        .select({
          id: contentItems.id,
          type: contentItems.type,
          title: contentItems.title,
          bodyOrFileUrl: contentItems.bodyOrFileUrl,
          createdAt: contentItems.createdAt,
          subjectName: jambSubjects.name,
        })
        .from(contentItems)
        .innerJoin(jambSubjects, eq(contentItems.jambSubjectId, jambSubjects.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(asc(contentItems.id));

      const data = await withSignedUrls(rows);
      return NextResponse.json({ data });
    }

    const profileRows = await db
      .select({
        departmentId: studentProfiles.departmentId,
        levelId: studentProfiles.levelId,
      })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, auth.userId))
      .orderBy(asc(studentProfiles.userId))
      .limit(1);

    const profile = profileRows[0];
    if (!profile) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Complete onboarding first" } },
        { status: 404 },
      );
    }

    const deptRows = await db
      .select({ facultyId: departments.facultyId })
      .from(departments)
      .where(eq(departments.id, profile.departmentId))
      .orderBy(asc(departments.id))
      .limit(1);

    const facultyId = deptRows[0]?.facultyId ?? null;

    let interfacultyCourseIds: number[] = [];
    if (facultyId !== null) {
      const linkRows = await db
        .select({ courseId: courseFaculties.courseId })
        .from(courseFaculties)
        .where(eq(courseFaculties.facultyId, facultyId))
        .orderBy(asc(courseFaculties.courseId));
      interfacultyCourseIds = linkRows.map((row) => row.courseId);
    }

    const activeSemester = await getActiveSemester(db);

    const accessConds = [
      eq(courses.scopeType, "general"),
      and(
        eq(courses.scopeType, "department"),
        eq(courses.departmentId, profile.departmentId),
      ),
    ];
    if (facultyId !== null) {
      accessConds.push(
        and(eq(courses.scopeType, "faculty"), eq(courses.facultyId, facultyId)),
      );
      if (interfacultyCourseIds.length > 0) {
        accessConds.push(
          and(
            eq(courses.scopeType, "interfaculty"),
            inArray(courses.id, interfacultyCourseIds),
          ),
        );
      }
    }

    const conds = [
      eq(courses.semester, activeSemester),
      eq(courses.levelId, profile.levelId),
      or(...accessConds),
    ];
    if (courseIdFilter !== undefined) {
      conds.push(eq(contentItems.courseId, courseIdFilter));
    }

    const rows = await db
      .select({
        id: contentItems.id,
        type: contentItems.type,
        title: contentItems.title,
        bodyOrFileUrl: contentItems.bodyOrFileUrl,
        createdAt: contentItems.createdAt,
        courseCode: courses.code,
      })
      .from(contentItems)
      .innerJoin(courses, eq(contentItems.courseId, courses.id))
      .where(and(...conds))
      .orderBy(asc(contentItems.id));

    const data = await withSignedUrls(rows);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

interface ResourceRow {
  id: number;
  type: string;
  bodyOrFileUrl: string;
  [key: string]: unknown;
}

// PDFs live in a private bucket — each response carries a short-lived signed
// URL instead of a permanent public link. Article bodies pass through as-is.
async function withSignedUrls<T extends ResourceRow>(rows: T[]): Promise<Record<string, unknown>[]> {
  return Promise.all(
    rows.map(async ({ bodyOrFileUrl: storedValue, ...row }) => {
      if (row.type !== "pdf") {
        // Articles store their markdown body inline in the same column.
        return { ...row, body: storedValue };
      }
      const fileUrl = await createResourceSignedUrl(storedValue).catch(() => null);
      return { ...row, fileUrl };
    }),
  );
}
