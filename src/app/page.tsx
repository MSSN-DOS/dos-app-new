import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GeoLattice } from "@/components/ui/geo-lattice";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HomeRedirect } from "@/components/auth/home-redirect";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <HomeRedirect />
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/80"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        aria-label="Site header"
      >
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dos-icon.svg" alt="DOS Site" width={28} height={28} className="h-7 w-7 shrink-0" />
            <span className="text-sm font-semibold tracking-tight">DOS Site</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="px-3 text-muted-foreground">
              <Link href="/login">Log in</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <GeoLattice className="pointer-events-none absolute inset-0 h-full w-full text-primary/7 dark:text-primary/14" />
          <div className="relative mx-auto flex w-full max-w-3xl min-w-0 flex-col items-center px-4 py-24 text-center md:py-32">
            <h1 className="max-w-[14ch] text-[clamp(2rem,8vw,3rem)] font-bold tracking-tight text-balance leading-[1.05] text-foreground md:text-5xl md:leading-[1.05]">
              Study your courses.
              <br />
              Prepare for Post-UTME.
            </h1>
            <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
              Weekly quizzes that count toward your CGPA, or JAMB subject practice scored out of 50 — free, run by the
              Board of Studies.
            </p>
            <div className="mt-8 flex w-full flex-col items-center gap-3 px-4 sm:w-auto sm:flex-row sm:px-0">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link href="/register/student">Create student account</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/register/aspirant">Create aspirant account</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Free · Board-verified · New Course Quiz every Sat 00:00–Sun 23:59 (WAT)</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Log in
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-24 pb-[max(6rem,env(safe-area-inset-bottom))] md:grid-cols-2 [content-visibility:auto] [contain-intrinsic-size:400px]">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle as="h2" className="text-base font-semibold wrap-break-word">
                For students
              </CardTitle>
              <CardDescription className="wrap-break-word">Weekly Course Quizzes scoped to your department and level.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground wrap-break-word">
              Submit any time Sat–Sun; scores stay hidden until the Board releases them, then update your CGPA and
              leaderboard. Retake only where the quiz allows it.
            </CardContent>
          </Card>
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle as="h2" className="text-base font-semibold wrap-break-word">
                For aspirants
              </CardTitle>
              <CardDescription className="wrap-break-word">JAMB subject practice scored the Post-UTME way.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground wrap-break-word">
              Choose your Department of Aspiration once — every quiz builds a Post-UTME score out of 50, ranked
              separately from students.
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <p className="min-w-0 wrap-break-word text-xs text-muted-foreground">
            Board of Studies — Muslim Society of Nigeria, University of Ilorin
          </p>
          <p className="shrink-0 text-xs text-muted-foreground">Free · Forever</p>
        </div>
      </footer>
    </div>
  );
}
