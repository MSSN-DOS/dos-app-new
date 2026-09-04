"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import type { RoleName } from "@/lib/auth/client-fetch";

// Client-side route protection for role-scoped page shells. The JWT lives in localStorage
// (not a cookie), so there is nothing a server layout/middleware could read — the real
// enforcement point for data stays in every API handler via requireAuth(). This guard only
// keeps the wrong role from seeing the shell UI.
export function RequireRole({
  role,
  roles,
  children,
}: {
  /** Single allowed role. */
  role?: RoleName;
  /** Multiple allowed roles (e.g. student + aspirant sharing the /dashboard shell). */
  roles?: RoleName[];
  children: ReactNode;
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  const allowed = roles ?? (role ? [role] : []);
  const ready = !loading;
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!user?.role || !allowed.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area requires the {allowed.join(" or ")} role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
