"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { roleDashboardPath } from "@/components/auth/redirect-if-authenticated";

export function HomeRedirect() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(roleDashboardPath(user?.role));
    }
  }, [loading, isAuthenticated, user?.role, router]);

  return null;
}
