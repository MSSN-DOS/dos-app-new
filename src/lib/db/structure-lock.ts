import { sql } from "drizzle-orm";
import type { getDb } from ".";

// Lock before duplicate reads in both ordinary forms and batch operations.
// Transaction-scoped so rollback and connection reuse cannot leak the lock.
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function lockStructureWrites(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(1146311507, 1)`);
}
