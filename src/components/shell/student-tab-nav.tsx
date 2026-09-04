"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StudentTabItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function StudentTopTabs({ items }: { items: StudentTabItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              active
                ? "bg-wash text-ink ring-1 ring-edge/70"
                : "text-sub hover:bg-wash hover:text-ink"
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StudentBottomNav({ items }: { items: StudentTabItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-sunk/80 px-1.5 py-2 backdrop-blur-xl supports-backdrop-filter:bg-sunk/80 md:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      {items.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-xs font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset",
              active ? "text-brand" : "text-faint hover:text-sub"
            )}
          >
            {active ? (
              <span
                className="absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_8px_1px_rgba(91,127,255,0.9)]"
                aria-hidden="true"
              />
            ) : null}
            <item.icon
              className={cn("size-5 shrink-0", active ? "text-brand" : "text-faint")}
              aria-hidden="true"
            />
            <span className="max-w-full truncate text-center text-[10px] font-semibold leading-none tracking-wide">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
