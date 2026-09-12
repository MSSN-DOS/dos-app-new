"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon } from "lucide-react";

import { RequireRole } from "@/components/auth/require-role";
import { OnboardingGuard } from "@/components/auth/onboarding-guard";
import { STUDENT_NAV_ITEMS } from "@/components/shell/role-nav";
import { StudentBottomNav, StudentTopTabs } from "@/components/shell/student-tab-nav";
import { StudentUserMenu } from "@/components/shell/student-user-menu";
import { OneTimeTour } from "@/components/tours/one-time-tour";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

import type { DriveStep } from "driver.js";

const STUDENT_DASH_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Welcome to your dashboard",
      description:
        "Your weekly practice and Course Quiz results in one place. This tour runs once — here are the important spots.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "Your home screen",
      description:
        "Your ID card and your latest Post-UTME / CGPA picture live here, with your next quiz window.",
    },
  },
  {
    popover: {
      title: "This week",
      description:
        "Quizzes assigned to your faculty, level and the active semester appear under This week. Attempt them before the window closes.",
    },
  },
  {
    popover: {
      title: "Scores are held",
      description:
        "Course Quiz scores are held until the Board releases them — check History to see released results and your CGPA movement.",
    },
  },
];

const STUDENT_HISTORY_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Your attempt history",
      description: "Every Topic and Course Quiz you have attempted, with your result once it is released.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "History",
      description: "A chronological list of attempts. Held scores show as pending until the Board releases them.",
    },
  },
  {
    element: '[aria-label="Filter by quiz type"]',
    popover: {
      title: "Filter attempts",
      description: "Split between Topic Quizzes (practice) and Course Quizzes (they move your CGPA and Post-UTME).",
    },
  },
  {
    popover: {
      title: "Replay if allowed",
      description: "Quizzes that allow multiple attempts can be retaken straight from their row.",
    },
  },
];

const STUDENT_RESOURCES_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Resources",
      description: "Course notes and announcements published by the Admin — PDFs and articles in one library.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "The library",
      description: "Browse everything available to your track, newest first.",
    },
  },
  {
    element: '[aria-label="Course filter"]',
    popover: {
      title: "Find your course",
      description: "Filter resources by JAMB subject or by course so only what you need stays in view.",
    },
  },
  {
    popover: {
      title: "Study anytime",
      description: "Resources stay available after the semester — they are reference material, not timed quizzes.",
    },
  },
];

function studentStepsFor(pathname: string): { key: string; steps: DriveStep[] } | null {
  if (pathname === "/dashboard") return { key: "student.dashboard", steps: STUDENT_DASH_STEPS };
  if (pathname === "/history") return { key: "student.history", steps: STUDENT_HISTORY_STEPS };
  if (pathname === "/resources") return { key: "student.resources", steps: STUDENT_RESOURCES_STEPS };
  return null;
}


function StudentSidebar() {
  const pathname = usePathname();
  return (
    <aside aria-label="Student sidebar" className="hidden w-[272px] shrink-0 flex-col border-r border-line bg-sunk lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <span className="relative inline-flex shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dos-icon.svg" alt="DOS Site" width={28} height={28} className="h-7 w-7 shrink-0 rounded-md" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-canvas ring-1 ring-line"
          >
            <Moon className="size-2.5 fill-gold text-gold" />
          </span>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink" style={{ fontFamily: "var(--font-heading, Fraunces, serif)" }}>
          DOS <span className="font-semibold text-gold">Site</span>
        </span>
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          Navigation
        </p>
        <ul className="space-y-1">
          {STUDENT_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    active
                      ? "bg-brand text-white shadow-[0_4px_14px_rgba(91,127,255,0.35)]"
                      : "text-sub hover:bg-wash hover:text-ink",
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-faint")} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 rounded-2xl border border-line bg-panel p-3">
          <p className="text-xs font-semibold text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
            Your progress
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sub">Quizzes appear per your Faculty / Level and the active semester. Check History after the Board releases scores.</p>
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-wash px-2 py-2 ring-1 ring-edge/50">
          <span className="px-1 text-xs font-medium text-sub">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

// Student and Aspirant share the same URLs (/dashboard, /history, /resources) and the same
// nav (screens-aspirant.md: "Same shell pattern as Student") — one route group, both roles
// allowed. The screens themselves branch on track later (P4-4/P5-4/P5-5/P6-3).
// Shell: bottom tab on mobile, top tabs on tablet, sidebar on desktop (lg).

export default function StudentAspirantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const tour = studentStepsFor(pathname);
  return (
    <RequireRole roles={["student", "aspirant"]}>
      <OnboardingGuard>
        <div
          className="flex min-h-dvh bg-canvas text-ink lg:flex-row"
          style={{
            background:
              "radial-gradient(ellipse 500px 300px at 15% -5%, var(--dos-brand-glow), transparent), radial-gradient(ellipse 400px 280px at 100% 15%, var(--dos-gold-glow), transparent), var(--dos-canvas)",
          }}
        >
          <StudentSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header
              className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-line bg-sunk/80 px-4 backdrop-blur-xl supports-backdrop-filter:bg-sunk/80 md:px-6"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
              aria-label="Student header"
            >
              <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 lg:mx-0 lg:max-w-none">
                <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden">
                  <span className="relative inline-flex shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/dos-icon.svg"
                      alt="DOS Site"
                      width={28}
                      height={28}
                      className="h-7 w-7 shrink-0 rounded-md"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-canvas ring-1 ring-line"
                    >
                      <Moon className="size-2.5 fill-gold text-gold" />
                    </span>
                  </span>
                  <span
                    className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline"
                    style={{ fontFamily: "var(--font-heading, Fraunces, serif)" }}
                  >
                    DOS <span className="font-semibold text-gold">Site</span>
                  </span>
                </Link>
                <div className="hidden md:flex lg:hidden">
                  <StudentTopTabs items={STUDENT_NAV_ITEMS} />
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="lg:hidden">
                    <ThemeToggle />
                  </span>
                  <StudentUserMenu />
                </div>
              </div>
            </header>
            <main
              id="main"
              className="mx-auto w-full max-w-5xl flex-1 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8 lg:mx-0 lg:max-w-none lg:px-8 xl:px-10"
            >
              {children}
            </main>
            <StudentBottomNav items={STUDENT_NAV_ITEMS} />
          </div>
        </div>
        {tour ? <OneTimeTour tourKey={tour.key} steps={tour.steps} /> : null}
      </OnboardingGuard>
    </RequireRole>
  );
}
