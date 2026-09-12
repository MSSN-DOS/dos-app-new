import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoLattice } from "@/components/ui/geo-lattice";

// Centered single-column card shell shared by every pre-login/auth screen (per screens-auth.md).
// Khatam lattice at low opacity carries the MSSN identity; the card floats above it on a solid
// surface so form fields keep their contrast. All colors resolve to DESIGN.md §12 tokens.
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      <GeoLattice className="pointer-events-none absolute inset-0 h-full w-full text-primary/5 dark:text-primary/10" />
      <div className="relative w-full max-w-md">
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Board of Studies · MSSN Unilorin
        </p>
        <Card className="bg-card shadow-xl ring-1 ring-foreground/10">
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

export function FullPageLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <p className="text-muted-foreground">Loading…</p>
    </main>
  );
}
