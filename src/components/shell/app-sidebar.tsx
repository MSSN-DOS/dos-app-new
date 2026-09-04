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
  subtitle,
  items,
}: {
  homeHref: string;
  // title stays in the type for call-site compatibility; the wordmark is
  // the fixed DOS Site brand (gold accent), not a per-role string.
  title?: string;
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dos-icon.svg"
                  alt="DOS Site"
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-lg"
                />
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">
                    DOS <span className="text-gold">Site</span>
                  </span>
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
