"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoLattice } from "@/components/ui/geo-lattice";

// Shell for the two registration screens only — a 50|50 desktop split with the track switcher
// (Student / Aspirant) on the left and the form card centered on the right; tabs on mobile.
// /login is excluded: it serves all four roles with one form, so it uses the plain AuthCard.
const AUTH_MODES = [
  { href: "/register/student", label: "Student sign-up", hint: "Matric No." },
  { href: "/register/aspirant", label: "Aspirant sign-up", hint: "JAMB Reg No." },
];

function isActive(pathname: string, href: string) {
  return pathname === href;
}

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="flex min-h-dvh flex-col bg-background md:grid md:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-border md:block">
        <GeoLattice
          id="geo-lattice-side"
          className="pointer-events-none absolute inset-0 h-full w-full text-primary/5 dark:text-primary/10"
        />
        <div className="relative flex h-full flex-col items-center justify-center p-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Board of Studies · MSSN Unilorin
          </p>
          <nav
            aria-label="Authentication pages"
            className="mt-8 flex w-full max-w-xs flex-col gap-2"
          >
            {AUTH_MODES.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-lg bg-primary px-4 py-3 text-primary-foreground"
                      : "rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10 hover:bg-muted"
                  }
                >
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span
                    className={
                      active
                        ? "block text-xs text-primary-foreground/80"
                        : "block text-xs text-muted-foreground"
                    }
                  >
                    {item.hint}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="border-b border-border px-3 py-3 md:hidden">
        <nav aria-label="Authentication pages" className="grid grid-cols-2 gap-1">
          {AUTH_MODES.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-md bg-primary px-2 py-2.5 text-center text-xs font-medium text-primary-foreground"
                    : "rounded-md px-2 py-2.5 text-center text-xs font-medium text-muted-foreground hover:bg-muted"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10">
        <Card className="w-full max-w-md shadow-xl ring-1 ring-foreground/10">
          <CardHeader>
            <CardTitle className="text-center text-xl font-semibold tracking-tight">
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
