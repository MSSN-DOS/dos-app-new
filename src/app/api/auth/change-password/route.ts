import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { changePasswordSchema } from "@/lib/validation/auth";

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
 * POST /api/auth/change-password
 *
 * The caller changes their own password. Deliberately **no role list** on `requireAuth`: this
 * touches only the authenticated user's own row, and every role needs it — a Teacher's password
 * is generated for them and shown once, so without this they could never rotate it.
 *
 * There is no self-service reset (no email/SMS in the MVP), so supplying the current password is
 * the only available proof of ownership.
 *
 * Known limitation: tokens are stateless JWTs with a 7-day expiry (DESIGN.md §7), so an existing
 * token keeps working after a password change. Changing the password does not sign other devices
 * out.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    const data = changePasswordSchema.parse(await request.json());
    const db = getDb();

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found" } },
        { status: 404 },
      );
    }

    const currentIsCorrect = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!currentIsCorrect) {
      // Field-scoped so the form can mark the right input rather than showing a banner.
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: [
              {
                field: "currentPassword",
                code: "invalid_value",
                message: "That is not your current password",
              },
            ],
          },
        },
        { status: 422 },
      );
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(data.newPassword) })
      .where(eq(users.id, auth.userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) return validationError(err);
    return errorResponse(err);
  }
}
