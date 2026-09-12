import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { parsePagination, paginate } from "@/lib/api/pagination";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { levels } from "@/lib/db/schema";
import { levelCreateSchema } from "@/lib/validation/structure";

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
    const rows = await getDb().select().from(levels).orderBy(asc(levels.value));
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
    const data = levelCreateSchema.parse(json);

    const db = getDb();
    const [existing] = await db
      .select({ id: levels.id })
      .from(levels)
      .where(eq(levels.value, data.value))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: `Level ${data.value} already exists` } },
        { status: 409 },
      );
    }

    const [row] = await db.insert(levels).values({ value: data.value }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
