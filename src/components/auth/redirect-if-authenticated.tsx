"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import type { RoleName } from "@/lib/auth/client-fetch";

export function roleDashboardPath(role: RoleName | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/dashboard";
}

// Renders nothing and bounces already-authenticated visitors off the guest-only
// screens (login/register/onboarding) to their role's home.
export function RedirectIfAuthenticated() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(roleDashboardPath(user?.role));
    }
  }, [loading, isAuthenticated, user?.role, router]);

  return null;
}
