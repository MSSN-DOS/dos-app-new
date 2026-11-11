import { eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";

import { errorResponse } from "@/lib/api/response";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { checkRateLimit, rateLimitKey } from "@/lib/auth/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import type { RoleName } from "@/lib/auth/client-fetch";

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const json = await request.json();
    const data = loginSchema.parse(json);

    const rl = checkRateLimit(rateLimitKey(request, data.identifier));
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.retryAfterMs ?? 0) / 1000);
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const db = getDb();
    // A Student signs in with either identifier they hold (Board decision 2026-11-10): the one
    // they signed up with (`identifier`), or the second one attached later from
    // /account/identifiers. Every other role only ever stores a value in `identifier`, so this is
    // a superset of the previous single-column lookup rather than a behaviour change for them.
    //
    // Compared case-insensitively on both sides: identifiers are stored upper-case now, but people
    // type them in whichever case, and a row seeded before normalisation (e.g. a hand-set bootstrap
    // admin identifier) may not be upper-case at all. Upper-casing both sides handles every case
    // without touching stored data. It costs the unique index on this one lookup — acceptable for
    // a single row against a table this size, and the rate limiter caps attempts per identifier.
    const lookup = data.identifier.toUpperCase();
    const [user] = await db
      .select({
        id: users.id,
        roleId: users.roleId,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        role: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        or(
          eq(sql`upper(${users.identifier})`, lookup),
          eq(sql`upper(${users.matricNumber})`, lookup),
          eq(sql`upper(${users.jambRegNumber})`, lookup),
        ),
      )
      // Deterministic if one string ever matched two rows: the original sign-in value beats an
      // alias. Without this the winner would depend on row order.
      .orderBy(sql`case when upper(${users.identifier}) = ${lookup} then 0 else 1 end`)
      .limit(1);

    // Same generic message for "no user" and "wrong password" so we don't reveal which identifiers exist.
    if (
      !user ||
      !user.isActive ||
      !(await verifyPassword(data.password, user.passwordHash))
    ) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid identifier or password" } },
        { status: 401 },
      );
    }

    const token = await signSession({ userId: user.id, roleId: user.roleId });

    return NextResponse.json(
      { token, user: { id: user.id, roleId: user.roleId, role: user.role as RoleName } },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
