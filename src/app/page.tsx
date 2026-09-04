"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GeoLattice } from "@/components/ui/geo-lattice";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* Placeholder logo: Vercel triangle mark. Replace with MSSN logo (tracked in STATE.md). */}
            <svg
              aria-label="DOS Site logo placeholder"
              viewBox="0 0 76 65"
              className="h-7 w-7 text-foreground"
              fill="currentColor"
            >
              <path d="M37.59.25l36.95 64H.64l36.95-64z" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">DOS Site</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <GeoLattice className="pointer-events-none absolute inset-0 h-full w-full text-primary/5 dark:text-primary/10" />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-24 text-center md:py-32">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Board of Studies · MSSN, University of Ilorin
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl md:leading-tight">
              Study your courses.
              <br />
              Prepare for Post-UTME.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Weekly quizzes that count toward your CGPA, or JAMB subject practice scored out
              of 50 — free, run by the Board of Studies.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/register/student">Create student account</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              JAMB aspirant?{" "}
              <Link href="/register/aspirant" className="text-primary underline underline-offset-4">
                Register here
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-24 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">For students</CardTitle>
              <CardDescription>Weekly Course Quizzes for your department and level.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Scores are held until the Board releases them, then feed your CGPA and the
              leaderboard. Retake where the quiz allows it.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">For aspirants</CardTitle>
              <CardDescription>JAMB subject practice, scored the Post-UTME way.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Pick your Department of Aspiration once — every quiz you take builds a Post-UTME
              score out of 50, ranked separately from students.
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6">
          <p className="text-xs text-muted-foreground">
            Board of Studies — Muslim Society of Nigeria, University of Ilorin
          </p>
          <p className="text-xs text-muted-foreground">Free · Forever</p>
        </div>
      </footer>
    </div>
  );
}
