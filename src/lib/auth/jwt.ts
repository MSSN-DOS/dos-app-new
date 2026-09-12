// JWT sign/verify for the custom auth scheme (DESIGN.md §7).
//
// Token payload is intentionally minimal: { userId, roleId } only — no PII. 7-day expiry, no
// refresh token (resolved decision #12). Uses `jose` (HS256) so the same code works in Node and
// edge runtimes. Secret comes from JWT_SECRET (env). Never log the token or the secret.

import { SignJWT, jwtVerify } from "jose";

export interface SessionPayload {
  userId: number;
  roleId: number;
}

const ALG = "HS256";
const DEFAULT_EXPIRES_IN = "7d";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to .env.local — see README.md.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  payload: SessionPayload,
  expiresIn: string = DEFAULT_EXPIRES_IN,
): Promise<string> {
  return new SignJWT({ userId: payload.userId, roleId: payload.roleId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  const userId = payload.userId;
  const roleId = payload.roleId;
  if (typeof userId !== "number" || typeof roleId !== "number") {
    throw new Error("Malformed JWT payload");
  }
  return { userId, roleId };
}
