"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <main
          id="main"
          className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-16 text-center text-zinc-900"
        >
          <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The application hit an unexpected error. Reload to try again.
            </p>
            {error.digest ? (
              <p className="mt-2 font-mono text-xs text-zinc-500">Ref: {error.digest}</p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Try again
              </button>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
              >
                Go to home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
