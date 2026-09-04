"use client";

import { RequireRole } from "@/components/auth/require-role";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TEACHER_NAV_ITEMS } from "@/components/shell/role-nav";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function TeacherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireRole role="teacher">
      <SidebarProvider>
        <AppSidebar homeHref="/teacher" title="DOS Site" subtitle="Teacher" items={TEACHER_NAV_ITEMS} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger aria-label="Toggle sidebar" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">Teacher</span>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </RequireRole>
  );
}
