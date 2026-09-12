import type { AuthContext } from "./guard";

// Strict ownership model (Board decision): teachers may only touch content they created;
// admins bypass ownership entirely. Returns the userId to scope by, or null when the caller
// is an admin (no scoping).
export function ownershipScope(auth: AuthContext): number | null {
  return auth.roleName === "teacher" ? auth.userId : null;
}

export function forbiddenUnlessOwned(
  auth: AuthContext,
  createdBy: number | null,
): boolean {
  const scope = ownershipScope(auth);
  return scope === null || createdBy === scope;
}
