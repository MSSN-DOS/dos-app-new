import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { roles, users } from "../db/schema";
import { roleNameEnum } from "../db/schema/enums";

import { ForbiddenError, UnauthorizedError } from "./errors";
import { verifySession, type SessionPayload } from "./jwt";

export type RoleName = (typeof roleNameEnum.enumValues)[number];

export interface AuthContext extends SessionPayload {
  roleName?: RoleName;
}

// The single auth enforcement point for every /api route. Reads the Bearer token, verifies it,
// then re-reads the account itself so a deactivated or deleted user loses access on their next
// request instead of riding a 7-day token to expiry. (When allowedRoles is given) it also confirms
// the caller's role. Throws UnauthorizedError / ForbiddenError which route handlers convert to a
// JSON response via the shared error handler. No route is guarded by folder convention alone —
// this call inside the handler is the real check.
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

  // Existence + active state + role come back in one round trip. A missing row (hard-deleted
  // account) and an inactive one are both 401, not 403 — the token no longer names a usable
  // account, so "you may not do this" would misrepresent the problem.
  const [account] = await getDb()
    .select({ roleName: roles.name, isActive: users.isActive })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!account || !account.isActive) {
    throw new UnauthorizedError("Your account is no longer active");
  }

  const roleName = account.roleName as RoleName;

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(roleName)) {
    throw new ForbiddenError("You do not have permission to access this resource");
  }

  return { ...payload, roleName };
}
