import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";

import { getDb } from "@/lib/db";
import {
  aspirantProfiles,
  departments,
  departmentLevels,
  roles,
  studentProfiles,
} from "@/lib/db/schema";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";

async function roleNameOf(roleId: number): Promise<string> {
  const [role] = await getDb()
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  return role?.name ?? "";
}

// GET: has this user already onboarded? 200 with the profile if yes, 404 if not.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { userId, roleId } = await requireAuth(request);
    const roleName = await roleNameOf(roleId);
    const db = getDb();

    if (roleName === "student") {
      const [profile] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, userId))
        .limit(1);
      if (profile) return NextResponse.json({ profile });
    } else if (roleName === "aspirant") {
      const [profile] = await db
        .select()
        .from(aspirantProfiles)
        .where(eq(aspirantProfiles.userId, userId))
        .limit(1);
      if (profile) return NextResponse.json({ profile });
    }
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No profile yet" } },
      { status: 404 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST: write the one-time profile row. Students get department + level (faculty is implied by
// the department); aspirants get a department of aspiration. Admin/Teacher can't onboard here.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId, roleId } = await requireAuth(request);
    const roleName = await roleNameOf(roleId);
    const db = getDb();

    if (roleName === "student") {
      const body = await request.json();
      const parsed = z
        .object({
          departmentId: z.number().int().positive(),
          levelId: z.number().int().positive(),
        })
        .safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "departmentId and levelId are required" } },
          { status: 422 },
        );
      }

      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, parsed.data.departmentId))
        .limit(1);
      if (!dept) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Unknown department" } },
          { status: 422 },
        );
      }
      const [link] = await db
        .select()
        .from(departmentLevels)
        .where(
          and(
            eq(departmentLevels.departmentId, parsed.data.departmentId),
            eq(departmentLevels.levelId, parsed.data.levelId),
          ),
        )
        .limit(1);
      if (!link) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "That level is not offered in this department" } },
          { status: 422 },
        );
      }

      const [existing] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, userId))
        .limit(1);
      if (existing) {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "Profile already exists" } },
          { status: 409 },
        );
      }

      await db
        .insert(studentProfiles)
        .values({
          userId,
          departmentId: parsed.data.departmentId,
          levelId: parsed.data.levelId,
        });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (roleName === "aspirant") {
      const body = await request.json();
      const parsed = z
        .object({ aspirationDepartmentId: z.number().int().positive() })
        .safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "aspirationDepartmentId is required",
            },
          },
          { status: 422 },
        );
      }

      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, parsed.data.aspirationDepartmentId))
        .limit(1);
      if (!dept) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Unknown department" } },
          { status: 422 },
        );
      }

      const [existing] = await db
        .select()
        .from(aspirantProfiles)
        .where(eq(aspirantProfiles.userId, userId))
        .limit(1);
      if (existing) {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "Profile already exists" } },
          { status: 409 },
        );
      }

      await db
        .insert(aspirantProfiles)
        .values({ userId, aspirationDepartmentId: parsed.data.aspirationDepartmentId });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only students and aspirants onboard here" } },
      { status: 403 },
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input" } },
        { status: 422 },
      );
    }
    return errorResponse(err);
  }
}
