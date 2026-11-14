import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";

import { errorResponse } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { checkRateLimit, rateLimitKey } from "@/lib/auth/rate-limit";
import { registerSchema } from "@/lib/validation/auth";
import { identifierTypeFor } from "@/lib/validation/identifiers";

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const json = await request.json();
    const data = registerSchema.parse(json);

    const rl = checkRateLimit(rateLimitKey(request, data.identifier));
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.retryAfterMs ?? 0) / 1000);
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const db = getDb();
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, data.role))
      .limit(1);

    if (!role) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Unknown role" } },
        { status: 422 },
      );
    }

    // The value's own shape decides its type — a Student may sign up with either a Matric number
    // or a JAMB number (Board decision 2026-11-10), so the chosen role can no longer pick it.
    const identifierType = identifierTypeFor(data.identifier);
    if (!identifierType) {
      // Unreachable: registerSchema already rejected anything matching neither format.
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid identifier" } },
        { status: 422 },
      );
    }

    const passwordHash = await hashPassword(data.password);

    try {
      const [user] = await db
        .insert(users)
        .values({
          roleId: role.id,
          fullName: data.fullName,
          identifier: data.identifier,
          identifierType,
          // Mirror into the matching per-type column so its unique index stops a second account
          // claiming the same number, and so login can match either column.
          matricNumber: identifierType === "matric_number" ? data.identifier : null,
          jambRegNumber: identifierType === "jamb_reg_number" ? data.identifier : null,
          passwordHash,
        })
        .returning({ id: users.id, roleId: users.roleId });

      // Auto-login: DESIGN.md §7 step 1 issues a JWT the client uses to reach onboarding.
      const token = await signSession({ userId: user.id, roleId: user.roleId });

      return NextResponse.json(
        {
          token,
          user: { id: user.id, roleId: user.roleId, role: data.role, identifierType },
        },
        { status: 201 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "An account with this identifier already exists",
            },
          },
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
