import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import {
  cgpaRecords,
  departments,
  levels,
  roles,
  studentProfiles,
  users,
} from "@/lib/db/schema";
import { studentListQuerySchema } from "@/lib/validation/users";

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

/** GET /api/admin/users/students?search=&facultyId=&departmentId=&levelId= */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const url = new URL(request.url);
    const pagination = parsePagination(url.searchParams);
    if (!pagination.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid pagination parameters",
            details: pagination.issues,
          },
        },
        { status: 422 },
      );
    }
    const query = studentListQuerySchema.safeParse({
      search: url.searchParams.get("search") ?? undefined,
      facultyId: url.searchParams.get("facultyId") ?? undefined,
      departmentId: url.searchParams.get("departmentId") ?? undefined,
      levelId: url.searchParams.get("levelId") ?? undefined,
    });
    if (!query.success) return validationError(query.error);

    const conditions = [eq(roles.name, "student")];
    const search = query.data.search;
    if (search !== undefined && search.length > 0) {
      const pattern = `%${search}%`;
      const searchCondition = or(ilike(users.fullName, pattern), ilike(users.identifier, pattern));
      if (searchCondition) conditions.push(searchCondition);
    }
    if (query.data.facultyId !== undefined)
      conditions.push(eq(departments.facultyId, query.data.facultyId));
    if (query.data.departmentId !== undefined)
      conditions.push(eq(studentProfiles.departmentId, query.data.departmentId));
    if (query.data.levelId !== undefined)
      conditions.push(eq(studentProfiles.levelId, query.data.levelId));

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        departmentName: departments.name,
        levelValue: levels.value,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .innerJoin(levels, eq(studentProfiles.levelId, levels.id))
      .where(and(...conditions))
      .orderBy(asc(users.fullName));

    // Latest CGPA per listed student — flat rows, max weekStart per user in JS
    // (same no-GROUP-BY-at-this-scale approach as the teachers route).
    const currentCgpa = new Map<number, string>();
    if (rows.length > 0) {
      const records = await db
        .select({ userId: cgpaRecords.userId, weekStart: cgpaRecords.weekStart, cgpaValue: cgpaRecords.cgpaValue })
        .from(cgpaRecords)
        .where(inArray(cgpaRecords.userId, rows.map((r) => r.id)))
        .orderBy(asc(cgpaRecords.userId), asc(cgpaRecords.weekStart));
      for (const rec of records) currentCgpa.set(rec.userId, rec.cgpaValue); // last = latest week
    }

    const data = rows.map((row) => {
      const raw = currentCgpa.get(row.id) ?? null;
      const current = raw !== null && Number(raw) > 5 ? (Math.min(5, Number(raw) / 20)).toFixed(2) : raw;
      return { ...row, currentCgpa: current };
    });
    return NextResponse.json(paginate(data, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}
