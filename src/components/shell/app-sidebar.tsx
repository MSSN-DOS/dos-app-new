"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface AppNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Shared role-shell sidebar for Teacher/Student/Aspirant route groups. Same mobile-first
// behavior as the admin shell: off-canvas Sheet drawer below md, icon rail at md+.
export function AppSidebar({
  homeHref,
  title,
  subtitle,
  items,
}: {
  homeHref: string;
  title: string;
  subtitle: string;
  items: AppNavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  {/* Placeholder logo: Vercel triangle mark. Replace with MSSN logo (tracked in STATE.md). */}
                  <svg
                    aria-label="DOS Site logo placeholder"
                    viewBox="0 0 76 65"
                    className="size-4"
                    fill="currentColor"
                  >
                    <path d="M37.59.25l36.95 64H.64l36.95-64z" />
                  </svg>
                </span>
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{title}</span>
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== homeHref && pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Log out" onClick={handleLogout}>
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
