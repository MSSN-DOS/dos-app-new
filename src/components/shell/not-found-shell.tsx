"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/auth-provider";
import { roleDashboardPath } from "@/components/auth/redirect-if-authenticated";
import { AdminSidebar } from "@/components/admin/admin-nav";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { StudentBottomNav, StudentTopTabs } from "@/components/shell/student-tab-nav";
import {
  STUDENT_NAV_ITEMS,
  TEACHER_NAV_ITEMS,
} from "@/components/shell/role-nav";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Global 404. Authenticated users keep their role's sidebar shell; guests get a plain page.
export function NotFoundShell() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const content = (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      {isAuthenticated ? (
        <Button asChild className="min-h-11">
          <Link href={roleDashboardPath(user?.role)}>Back to dashboard</Link>
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button asChild className="min-h-11">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      )}
    </div>
  );

  if (!isAuthenticated) {
    return <div className="flex min-h-dvh flex-col bg-background">{content}</div>;
  }

  if (user?.role === "student" || user?.role === "aspirant") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <header
          className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
          aria-label="Student header"
        >
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/dos-icon.svg" alt="DOS Site" width={28} height={28} className="h-7 w-7 shrink-0" />
              <span className="text-sm font-semibold">DOS Site</span>
            </Link>
            <StudentTopTabs items={STUDENT_NAV_ITEMS} />
            <span className="text-sm font-medium">Page not found</span>
          </div>
        </header>
        <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">{content}</div>
        <StudentBottomNav items={STUDENT_NAV_ITEMS} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      {user?.role === "admin" ? (
        <AdminSidebar />
      ) : (
        <AppSidebar homeHref="/teacher" title="DOS Site" subtitle="Teacher" items={TEACHER_NAV_ITEMS} />
      )}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Page not found</span>
        </header>
        {content}
      </SidebarInset>
    </SidebarProvider>
  );
}
