import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { paginate, parsePagination } from "@/lib/api/pagination";
import { hashPassword } from "@/lib/auth/password";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizzes, roles, users } from "@/lib/db/schema";
import { teacherCreateSchema } from "@/lib/validation/teachers";

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

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
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
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identifier: users.identifier,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(roles.name, "teacher"))
      .orderBy(asc(users.fullName));

    // Published-quiz counts per teacher, for the list row ("N quizzes published").
    // Fetched as flat rows and counted in JS — no GROUP BY needed at this scale.
    const published = await db
      .select({ createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.status, "published"))
      .orderBy(asc(quizzes.createdBy));
    const counts = new Map<number, number>();
    for (const p of published) {
      counts.set(p.createdBy, (counts.get(p.createdBy) ?? 0) + 1);
    }

    const data = rows.map((row) => ({ ...row, publishedQuizzes: counts.get(row.id) ?? 0 }));
    return NextResponse.json(paginate(data, pagination.params));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request, ["admin"]);
    const json = await request.json();
    const data = teacherCreateSchema.parse(json);

    const db = getDb();
    const [role] = await db.select().from(roles).where(eq(roles.name, "teacher")).limit(1);
    if (!role) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Unknown role" } },
        { status: 422 },
      );
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.identifier, data.staffId))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "An account with this staff ID already exists" } },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(data.password);

    try {
      const [row] = await db
        .insert(users)
        .values({
          roleId: role.id,
          fullName: data.fullName,
          identifier: data.staffId,
          identifierType: "staff_id",
          passwordHash,
        })
        .returning({
          id: users.id,
          fullName: users.fullName,
          identifier: users.identifier,
          isActive: users.isActive,
        });
      return NextResponse.json(row, { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "An account with this staff ID already exists" } },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
