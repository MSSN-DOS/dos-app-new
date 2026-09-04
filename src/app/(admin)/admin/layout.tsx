"use client";

import { RequireRole } from "@/components/auth/require-role";
import { AdminSidebar } from "@/components/admin/admin-nav";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger aria-label="Toggle sidebar" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">Admin</span>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </RequireRole>
  );
}
