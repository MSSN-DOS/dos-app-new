"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon } from "lucide-react";

import { RequireRole } from "@/components/auth/require-role";
import { TEACHER_NAV_ITEMS } from "@/components/shell/role-nav";
import { StudentUserMenu } from "@/components/shell/student-user-menu";
import { TeacherBottomNav, TeacherTopTabs } from "@/components/shell/teacher-tab-nav";
import { OneTimeTour } from "@/components/tours/one-time-tour";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

import type { DriveStep } from "driver.js";

const TEACHER_DASH_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Welcome to your teacher desk",
      description:
        "Everything you author lives here. This one-time tour shows the key spots so you can start building fast.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "Your dashboard",
      description:
        "A summary of the questions you have authored and the quizzes you have published across all your courses.",
    },
  },
  {
    element: '[aria-label="Recently published"]',
    popover: {
      title: "Recently published",
      description:
        "Your latest live content, so you always know what students can already see and attempt.",
    },
  },
  {
    popover: {
      title: "Where it all happens",
      description:
        "Open the Question bank to write questions, then Quizzes to group published questions into a Course or Topic quiz.",
    },
  },
];

const TEACHER_QUESTIONS_STEPS: DriveStep[] = [
  {
    popover: {
      title: "The question bank",
      description:
        "Write rich questions with science symbols — one at a time, or paste many at once with Bulk add.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "Questions",
      description:
        "Every question you author lives here. Drafts stay private; publishing runs the strict validation.",
    },
  },
  {
    element: '[aria-label="Filter by course"]',
    popover: {
      title: "Narrow the list",
      description:
        "Filter by course, question type and status. The hide-used switch keeps questions already attached to a quiz out of your way.",
    },
  },
  {
    popover: {
      title: "Paste many at once",
      description:
        "On Bulk add, one row per question: type the text, press Tab, then type the accepted answer. Extra Tab columns become extra blanks.",
    },
  },
  {
    popover: {
      title: "Drafts vs published",
      description:
        "Only published questions can be attached to a quiz, so keep drafts until you are happy with them.",
    },
  },
];

const TEACHER_QUIZZES_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Quizzes",
      description:
        "A quiz is a graded bundle of questions. Course Quizzes feed CGPA and the leaderboard; Topic Quizzes are for practice.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "Your quiz list",
      description: "Every quiz you have created, with its type, course and publish status.",
    },
  },
  {
    element: '[aria-label="Filter by type"]',
    popover: {
      title: "Filter the list",
      description: "Jump between Course and Topic quizzes, or filter by course, without scrolling.",
    },
  },
  {
    popover: {
      title: "Open a quiz to build it",
      description:
        "Click any quiz to reach its builder, where you attach questions and publish it to students.",
    },
  },
];

const TEACHER_BUILDER_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Quiz builder",
      description:
        "Set the rules on the left (time limit, pass mark, week), then attach the questions that make up the quiz.",
    },
  },
  {
    element: "main h1",
    popover: {
      title: "Quiz title",
      description: "Your quiz and its current progress — keep an eye on the attached count.",
    },
  },
  {
    element: '[aria-label="Question source"]',
    popover: {
      title: "Attach in bulk",
      description:
        "The Available bank hides questions already attached. Tick several rows and attach them in one click — no more one-by-one.",
    },
  },
  {
    popover: {
      title: "Switch to Attached",
      description:
        "Use the Attached tab to review what is in the quiz, and remove questions in bulk if you change your mind.",
    },
  },
  {
    popover: {
      title: "Ready to publish",
      description:
        "When every requirement is met the banner turns green. Publishing is permanent — students see it immediately.",
    },
  },
];

const TEACHER_TOPICS_STEPS: DriveStep[] = [
  {
    popover: {
      title: "Topics",
      description: "Group your questions under topics within each course to keep the bank organised.",
    },
  },
  {
    element: "main h1",
    popover: { title: "Course topics", description: "Create and manage the topics used to tag and filter questions." },
  },
  {
    popover: {
      title: "Ready when you are",
      description: "The sidebar always lists Dashboard, Topics, Questions, Quizzes and Results.",
    },
  },
];

function teacherStepsFor(pathname: string): { key: string; steps: DriveStep[] } | null {
  if (pathname === "/teacher") return { key: "teacher.dashboard", steps: TEACHER_DASH_STEPS };
  if (pathname === "/teacher/questions") return { key: "teacher.questions", steps: TEACHER_QUESTIONS_STEPS };
  if (pathname === "/teacher/quizzes") return { key: "teacher.quizzes", steps: TEACHER_QUIZZES_STEPS };
  if (pathname.startsWith("/teacher/quizzes/")) return { key: "teacher.quiz-builder", steps: TEACHER_BUILDER_STEPS };
  if (pathname === "/teacher/topics") return { key: "teacher.topics", steps: TEACHER_TOPICS_STEPS };
  return null;
}


function TeacherSidebar() {
  const pathname = usePathname();
  return (
    <aside
      aria-label="Teacher sidebar"
      className="hidden w-[272px] shrink-0 flex-col border-r border-line bg-sunk lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:overflow-hidden"
    >
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
        <span className="text-[15px] font-semibold tracking-tight text-ink" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          DOS <span className="font-semibold text-gold">Site</span>
        </span>
        <span className="rounded-full bg-wash px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sub ring-1 ring-edge/70">
          Teacher
        </span>
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          Navigation
        </p>
        <ul className="space-y-1">
          {TEACHER_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/teacher" && pathname.startsWith(item.href));
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
            Need a hand?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sub">Create topics, author the question bank, then build quizzes — all from this shell.</p>
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

export default function TeacherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const tour = teacherStepsFor(pathname);
  return (
    <RequireRole role="teacher">
      <div
        className="flex min-h-dvh bg-canvas text-ink lg:flex-row"
        style={{
          background:
            "radial-gradient(ellipse 500px 300px at 15% -5%, var(--dos-brand-glow), transparent), radial-gradient(ellipse 400px 280px at 100% 15%, var(--dos-gold-glow), transparent), var(--dos-canvas)",
        }}
      >
        <TeacherSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-line bg-sunk/80 px-4 backdrop-blur-xl supports-backdrop-filter:bg-sunk/80 md:px-6"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
            aria-label="Teacher header"
          >
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 lg:max-w-none lg:mx-0">
              <Link href="/teacher" className="flex items-center gap-2.5 lg:hidden">
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
                  style={{ fontFamily: "var(--font-fraunces), serif" }}
                >
                  DOS <span className="font-semibold text-gold">Site</span>
                </span>
                <span className="hidden text-xs font-medium tracking-wide text-sub sm:inline">Teacher</span>
              </Link>
              {/* hide top tabs on lg where sidebar handles nav — keep them for md (tablet) */}
              <div className="hidden md:flex lg:hidden">
                <TeacherTopTabs items={TEACHER_NAV_ITEMS} />
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
          <TeacherBottomNav items={TEACHER_NAV_ITEMS} />
        </div>
      </div>
      {tour ? <OneTimeTour tourKey={tour.key} steps={tour.steps} /> : null}
    </RequireRole>
  );
}
