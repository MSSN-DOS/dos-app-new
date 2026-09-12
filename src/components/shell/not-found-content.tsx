import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotFoundContent({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold tracking-tight">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Button asChild className="min-h-11">
        <Link href={homeHref}>Go home</Link>
      </Button>
    </main>
  );
}
