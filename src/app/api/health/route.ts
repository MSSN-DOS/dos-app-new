import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

// Public and unauthenticated on purpose — see DESIGN.md §7 "Public routes" and AGENTS.md §1.
// Its job is to make one cheap query so a Supabase Free-plan project (paused after 7 days of
// project inactivity) never goes a week without activity. Vercel Cron drives it once a day
// via `vercel.json`; any external uptime monitor may hit it too.
export const dynamic = "force-dynamic";

// A paused or unreachable database should fail fast instead of holding the invocation open
// until the platform's function timeout. postgres.js exposes `connect_timeout` only as a
// client-wide option, and this probe is not worth changing the shared client's behaviour.
const PROBE_TIMEOUT_MS = 4_000;

async function probeDatabase(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Database probe timed out")), PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();

  try {
    await probeDatabase();
    return NextResponse.json(
      { status: "ok", db: "ok", timestamp },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Deliberately swallowed. Why a probe failed (connection refused, bad credentials, paused
    // project, DNS) is exactly the internals a public endpoint must not hand back, so the
    // response says only that the database was unreachable.
    return NextResponse.json(
      { status: "degraded", db: "unreachable", timestamp },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
