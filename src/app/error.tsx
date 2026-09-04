"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for debugging; in production this could report to monitoring
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-16 text-center"
    >
      <div className="w-full max-w-xl rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground wrap-break-word">
          An unexpected error stopped this page. Try again — your data is safe.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="min-h-11">
            Try again
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link href="/">Go to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
