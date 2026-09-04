"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ChevronRight,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Wider prefix used to decide when this item counts as active (and shows its sub-items). */
  matchPrefix?: string;
  children?: { label: string; href: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "Structure",
    href: "/admin/structure/levels",
    icon: Building2,
    matchPrefix: "/admin/structure",
    children: [
      { label: "Levels", href: "/admin/structure/levels" },
      { label: "Faculties", href: "/admin/structure/faculties" },
      { label: "Departments", href: "/admin/structure/departments" },
      { label: "Courses", href: "/admin/structure/courses" },
    ],
  },
  { label: "Teachers", href: "/admin/teachers", icon: Users },
  { label: "Students", href: "/admin/students", icon: GraduationCap },
  { label: "Aspirants", href: "/admin/aspirants", icon: Target },
  { label: "Content", href: "/admin/content", icon: FileText },
  { label: "Leaderboard", href: "/admin/leaderboard", icon: Trophy },
  { label: "Score Release", href: "/admin/scores/release", icon: ShieldCheck },
  { label: "Settings", href: "/admin/settings/semester", icon: Settings2 },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  // null = user hasn't toggled manually; fall back to "open while active".
  const [sectionOverride, setSectionOverride] = useState<Record<string, boolean>>({});

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isOpen = (item: NavItem, active: boolean) =>
    sectionOverride[item.href] ?? (active && item.matchPrefix !== undefined);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
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
                  <span className="font-semibold">DOS Site</span>
                  <span className="text-xs text-muted-foreground">Admin</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.matchPrefix !== undefined && pathname.startsWith(item.matchPrefix)) ||
                  (item.href !== "/admin" &&
                    item.matchPrefix === undefined &&
                    pathname.startsWith(item.href));
                return (
                  <Collapsible
                    key={item.href}
                    open={item.children ? isOpen(item, active) : undefined}
                    onOpenChange={
                      item.children
                        ? (open) =>
                            setSectionOverride((prev) => ({ ...prev, [item.href]: open }))
                        : undefined
                    }
                    asChild
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.children ? (
                        <>
                          <SidebarMenuAction
                            aria-label={`${isOpen(item, active) ? "Collapse" : "Expand"} ${item.label}`}
                            onClick={() =>
                              setSectionOverride((prev) => ({
                                ...prev,
                                [item.href]: !isOpen(item, active),
                              }))
                            }
                          >
                            <ChevronRight
                              className={
                                isOpen(item, active)
                                  ? "transition-transform rotate-90"
                                  : "transition-transform"
                              }
                            />
                          </SidebarMenuAction>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.children.map((child) => (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={pathname === child.href}
                                  >
                                    <Link href={child.href}>{child.label}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </>
                      ) : null}
                    </SidebarMenuItem>
                  </Collapsible>
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
