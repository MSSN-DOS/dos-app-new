import { asc, and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { parsePagination, paginate } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { departmentLevels, departments } from "@/lib/db/schema";
import { departmentCreateSchema } from "@/lib/validation/structure";

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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const pagination = parsePagination(new URL(request.url).searchParams);
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
    const facultyIdParam = new URL(request.url).searchParams.get("facultyId");
    const facultyId = facultyIdParam === null ? null : Number(facultyIdParam);
    const db = getDb();
    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
        facultyId: departments.facultyId,
      })
      .from(departments)
      .orderBy(asc(departments.name));
    const links = await db
      .select({
        departmentId: departmentLevels.departmentId,
        levelId: departmentLevels.levelId,
      })
      .from(departmentLevels)
      .orderBy(asc(departmentLevels.departmentId));

    const levelIdsByDept = new Map<number, number[]>();
    for (const link of links) {
      const ids = levelIdsByDept.get(link.departmentId) ?? [];
      ids.push(link.levelId);
      levelIdsByDept.set(link.departmentId, ids);
    }

    const data = rows
      .filter((row) => facultyId === null || row.facultyId === facultyId)
      .map((row) => ({ ...row, levelIds: levelIdsByDept.get(row.id) ?? [] }));
    const result = paginate(data, pagination.params);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const data = departmentCreateSchema.parse(await request.json());
    const levelIds = [...new Set(data.levelIds)];

    const db = getDb();
    // Names are unique within a faculty (no DB constraint — enforced here).
    const [existing] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.name, data.name), eq(departments.facultyId, data.facultyId)))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Department "${data.name}" already exists in this faculty`,
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(departments)
      .values({ name: data.name, facultyId: data.facultyId })
      .returning();
    await db
      .insert(departmentLevels)
      .values(levelIds.map((levelId) => ({ departmentId: row.id, levelId })))
      .returning();

    return NextResponse.json({ ...row, levelIds }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
