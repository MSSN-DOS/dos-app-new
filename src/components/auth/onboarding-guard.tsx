"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

// Redirects to /onboarding when the signed-in student/aspirant has no profile row yet
// (GET /auth/onboarding answers 404 "No profile yet"). Renders children unchanged
// otherwise, so an already-onboarded user never sees a flash.
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  const status = useQuery({
    queryKey: ["auth", "onboarding", "status"],
    queryFn: () => apiFetch("/auth/onboarding", { method: "GET" }),
    enabled: !loading && isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (
      status.isError &&
      status.error instanceof ApiError &&
      status.error.status === 404
    ) {
      router.replace("/onboarding");
    }
  }, [status.isError, status.error, router]);

  return <>{children}</>;
}
