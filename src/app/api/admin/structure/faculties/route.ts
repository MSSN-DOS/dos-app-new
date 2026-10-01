import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/response";
import { parsePagination, paginate } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { faculties } from "@/lib/db/schema";
import { facultyCreateSchema } from "@/lib/validation/structure";

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
    const rows = await getDb().select().from(faculties).orderBy(asc(faculties.name));
    const { data, meta } = paginate(rows, pagination.params);
    return NextResponse.json({ data, meta });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const json = await request.json();
    const data = facultyCreateSchema.parse(json);

    const db = getDb();
    const [existing] = await db
      .select({ id: faculties.id })
      .from(faculties)
      .where(eq(faculties.name, data.name))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: `Faculty "${data.name}" already exists` } },
        { status: 409 },
      );
    }

    const [row] = await db.insert(faculties).values({ name: data.name }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
