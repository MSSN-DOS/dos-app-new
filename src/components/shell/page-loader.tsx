"use client";

import { useEffect, useState } from "react";

import type { RoleName } from "@/lib/auth/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Status lines cycled under the book loader while a route or an auth gate
 * resolves. Keep them generic — this component has no idea what the page is
 * actually fetching, so a message must never claim a specific task finished.
 */
export const LOADER_MESSAGES = [
  "Opening the question bank",
  "Sorting your topics",
  "Checking your quizzes",
  "Almost ready",
] as const;

const ROLE_LABELS: Record<RoleName, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  aspirant: "Aspirant",
};

/**
 * Message for a given cycle tick. Exported (and pure) so the wrap-around,
 * negative-tick, and empty-list cases are covered by a unit test rather than
 * only being exercised by a 1.8s timer.
 */
export function statusMessageAt(tick: number, messages: readonly string[]): string {
  if (messages.length === 0) return "";
  const size = messages.length;
  const index = ((Math.trunc(tick) % size) + size) % size;
  return messages[index] ?? "";
}

/**
 * The site's one loading state: a turning book with a bobbing spark, a sliding
 * progress bar, and a rotating status line. Used for route transitions
 * (`loading.tsx`) and for the client-side auth gates (session restore, role
 * redirect), which are the only places a user waits with no data on screen.
 *
 * All colour comes from DESIGN.md §12 tokens via globals.css — nothing here
 * hard-codes a palette value, so light and dark themes flip for free.
 */
export function PageLoader({
  role,
  messages = LOADER_MESSAGES,
  fullScreen = false,
  className,
}: {
  /** Shows a role pill under the brand, e.g. while the admin shell boots. */
  role?: RoleName;
  /** Override the cycling status lines (must stay honest about what is loading). */
  messages?: readonly string[];
  /** True when the loader owns the whole viewport (auth gates, root route). */
  fullScreen?: boolean;
  className?: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "dos-page-loader flex w-full flex-col items-center justify-center gap-6 px-4 py-12 text-center",
        fullScreen ? "min-h-dvh" : "min-h-[60dvh]",
        className,
      )}
    >
      <p className="flex flex-wrap items-center justify-center gap-2 text-base font-semibold">
        <span className="font-brand text-xl tracking-tight">DOS Site</span>
        {role ? (
          <span className="rounded-full border px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {ROLE_LABELS[role]}
          </span>
        ) : null}
      </p>

      <div className="dos-book" aria-hidden="true">
        <span className="dos-book-spark" />
        <span className="dos-book-half" />
        <span className="dos-book-half" data-side="right" />
        <span className="dos-book-leaf" data-leaf="1" />
        <span className="dos-book-leaf" data-leaf="2" />
        <span className="dos-book-leaf" data-leaf="3" />
      </div>

      <div className="dos-progress" aria-hidden="true">
        <span />
      </div>

      <p className="min-h-[1.2em] font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {statusMessageAt(tick, messages)}
      </p>
    </div>
  );
}
