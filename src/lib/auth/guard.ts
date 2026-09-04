import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { roles } from "../db/schema";
import { roleNameEnum } from "../db/schema/enums";

import { ForbiddenError, UnauthorizedError } from "./errors";
import { verifySession, type SessionPayload } from "./jwt";

export type RoleName = (typeof roleNameEnum.enumValues)[number];

export interface AuthContext extends SessionPayload {
  roleName?: RoleName;
}

// The single auth enforcement point for every /api route. Reads the Bearer token, verifies it,
// and (when allowedRoles is given) confirms the caller's role. Throws UnauthorizedError /
// ForbiddenError which route handlers convert to a JSON response via the shared error handler.
// No route is guarded by folder convention alone — this call inside the handler is the real check.
export async function requireAuth(
  request: Request,
  allowedRoles?: RoleName[],
): Promise<AuthContext> {
  // A missing secret is a deployment configuration failure, not a bad token — surface it as a
  // 500 instead of masquerading as 401 on every request.
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length).trim();
  let payload: SessionPayload;
  try {
    payload = await verifySession(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const [role] = await getDb()
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, payload.roleId))
      .limit(1);

    if (!role || !allowedRoles.includes(role.name as RoleName)) {
      throw new ForbiddenError("You do not have permission to access this resource");
    }

    return { ...payload, roleName: role.name as RoleName };
  }

  return payload;
}
