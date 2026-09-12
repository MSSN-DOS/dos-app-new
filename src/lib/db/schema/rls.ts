import { sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

// DESIGN.md §11: every table gets a deny-all RLS policy for Supabase's anon/authenticated
// roles. That pair is what PostgREST/GraphQL authenticates as, so this is what closes the
// side-door past the Next.js API. The app connects as `postgres` (rolbypassrls = true) and is
// unaffected. Do not remove without re-closing the hole another way.
export function denyPublicPolicy(tableName: string) {
  return pgPolicy(`${tableName}_deny_public`, {
    for: "all",
    to: ["anon", "authenticated"],
    using: sql`false`,
    withCheck: sql`false`,
  });
}
