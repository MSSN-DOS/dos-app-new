"use client";

import { RequireRole } from "@/components/auth/require-role";
import { AdminSidebar } from "@/components/admin/admin-nav";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireRole role="admin">
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset>
          <header
            className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
            aria-label="Admin header"
          >
            <SidebarTrigger
              aria-label="Toggle sidebar"
              className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
            />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium wrap-break-word">Admin</span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>
          <main
            id="main"
            className="flex-1 min-w-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8"
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RequireRole>
  );
}
