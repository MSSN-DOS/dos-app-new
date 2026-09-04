"use client";

import { RequireRole } from "@/components/auth/require-role";
import { OnboardingGuard } from "@/components/auth/onboarding-guard";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { STUDENT_NAV_ITEMS } from "@/components/shell/role-nav";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Student and Aspirant share the same URLs (/dashboard, /history, /resources) and the same
// nav (screens-aspirant.md: "Same shell pattern as Student") — one route group, both roles
// allowed. The screens themselves branch on track later (P4-4/P5-4/P5-5/P6-3).

export default function StudentAspirantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireRole roles={["student", "aspirant"]}>
      {/* Specs require redirect to /onboarding when the role's profile row is missing
          (student_profiles / aspirant_profiles) — checked via GET /auth/onboarding. */}
      <OnboardingGuard>
      <SidebarProvider>
        <AppSidebar homeHref="/dashboard" title="DOS Site" subtitle="Learning" items={STUDENT_NAV_ITEMS} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger aria-label="Toggle sidebar" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      </OnboardingGuard>
    </RequireRole>
  );
}
