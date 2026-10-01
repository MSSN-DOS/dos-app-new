/**
 * Record a migration you applied by hand in the drizzle journal, so `pnpm db:migrate` stays
 * consistent. Modeled on Prisma's `migrate resolve --applied`.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * The postgres migrator decides what to run by reading a single row:
 *
 * ```js
 * // node_modules/drizzle-orm/pg-core/dialect.js — migrate()
 * const dbMigrations = await session.all(
 *   sql`select id, hash, created_at from ... order by created_at desc limit 1`
 * );
 * const lastDbMigration = dbMigrations[0];
 * ...
 * if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { ...run... }
 * ```
 *
 * Two consequences, both of which bite here:
 *
 * 1. The **`hash` column is never compared**. Only `created_at` decides. So a migration applied
 *    by hand leaves the journal pointing at the *previous* migration, and the next `db:migrate`
 *    cheerfully tries to apply the hand-applied one a second time.
 * 2. Every pending migration runs inside **one transaction**. The first failure aborts the rest,
 *    so a re-run that dies on `CREATE TABLE "academic_sessions"` (already exists) also blocks
 *    every migration queued behind it. One hand-applied file wedges the whole pipeline.
 *
 * `drizzle/0008_material_thor.sql` is a hand-edited data migration, so applying it with `psql` is
 * a real thing people do on this repo. This script is the fix for the wedge: it inserts the row
 * the migrator was looking for.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It does **not** verify the migration is actually in the database. There is no general way to —
 * "is this migration applied?" depends entirely on what the file does, and `0008` mixes DDL with
 * data backfills that have no observable end state. So it prints the statements it is about to
 * mark as applied and makes you confirm.
 *
 * Marking a migration that was never applied is the one way to make this script harmful: the
 * migrator will skip that file forever, and the breakage surfaces later as a missing column rather
 * than a failed migration. Read the printed SQL and confirm the database actually has it.
 *
 * USAGE
 * -----
 *   pnpm db:mark-applied 0008_material_thor
 *   pnpm db:mark-applied --dry-run 0008_material_thor     # print, change nothing
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { sql } from "drizzle-orm";

import { assertDevEnvironment } from "./assert-dev-environment";

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL_PATH = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
/** Mirrors the migrator's own schema defaults. */
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}

export interface AppliedRow {
  hash: string;
  created_at: string;
}

/**
 * What to do about a requested tag. Pure, so the decision is unit-testable without a database —
 * the filesystem and the query are the only impure parts.
 */
export type MarkPlan =
  /** The journal is missing this migration and nothing later is applied: safe to insert. */
  | { kind: "mark"; entry: JournalEntry; hash: string; statements: string[] }
  /** Already recorded. Re-inserting would fork the chain. */
  | { kind: "already-marked"; entry: JournalEntry }
  /** Recorded, but under a different hash: the file changed after it ran. Never silently accept. */
  | { kind: "hash-mismatch"; entry: JournalEntry; recorded: string; current: string }
  /** Not a tag in the journal, so there is no `when` to record and no file to read. */
  | { kind: "unknown-tag"; tag: string; known: string[] }
  /** A later migration is already recorded, so the chain has moved past this one. */
  | { kind: "out-of-order"; tag: string; later: string[] };

/**
 * Decide what marking `tag` would do.
 *
 * @param tag        The migration tag, e.g. `0008_material_thor`.
 * @param journal    Entries from `meta/_journal.json`.
 * @param applied    Every row currently in the migrations table, oldest first.
 * @param fileSql    Contents of `drizzle/<tag>.sql`. Only read when the tag is known.
 */
export function planMark(
  tag: string,
  journal: JournalEntry[],
  applied: AppliedRow[],
  fileSql: string | null,
): MarkPlan {
  const entry = journal.find((candidate) => candidate.tag === tag);
  if (!entry) {
    return {
      kind: "unknown-tag",
      tag,
      known: journal.map((candidate) => candidate.tag),
    };
  }

  const currentHash = sha256(fileSql ?? "");
  const statements = splitStatements(fileSql ?? "");

  const recorded = applied.find((row) => Number(row.created_at) === entry.when);
  if (recorded) {
    // The migrator keys off created_at alone, so a row with this timestamp *is* the record of
    // this migration — but a differing hash means the file was edited after it ran. That is a
    // different (and worse) problem than the one this script exists to solve, so refuse rather
    // than paper over it.
    if (recorded.hash !== currentHash) {
      return { kind: "hash-mismatch", entry, recorded: recorded.hash, current: currentHash };
    }
    return { kind: "already-marked", entry };
  }

  // If anything newer is already recorded, then this migration is behind the chain: either it was
  // applied and recorded under a different timestamp, or the history is inconsistent. Inserting
  // would not help `db:migrate` (it reads only the newest row) and would add a row that lies.
  const later = applied
    .filter((row) => Number(row.created_at) > entry.when)
    .map((row) => String(row.created_at));
  if (later.length > 0) {
    return { kind: "out-of-order", tag, later };
  }

  return { kind: "mark", entry, hash: currentHash, statements };
}

/** The migrator hashes the raw file text, so this must match it byte for byte. */
function sha256(contents: string): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

/** Mirrors `readMigrationFiles` in drizzle-orm/migrator.cjs. */
function splitStatements(contents: string): string[] {
  return contents.split("--> statement-breakpoint").map((chunk) => chunk.trim()).filter(Boolean);
}

/**
 * Pull rows out of whatever `db.execute` handed back.
 *
 * This is not paranoia about shapes: with the postgres-js driver `db.execute()` resolves to the
 * row array itself, so `result.rows` is `undefined` and every read silently looked like an empty
 * table. That made `already-marked` unreachable and turned the hash-mismatch guard into dead code
 * — a script whose safety checks only run against a table with no rows. Both shapes are handled so
 * a driver swap cannot quietly disable them again.
 */
export function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result !== null && typeof result === "object" && "rows" in result) {
    const { rows } = result as { rows: unknown };
    if (Array.isArray(rows)) return rows as T[];
  }
  throw new Error(
    `Expected rows from the migrations table but got ${describeShape(result)}. Refusing to ` +
      "guess, because treating an unreadable journal as an empty one would offer to insert a " +
      "duplicate row.",
  );
}

function describeShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function readJournal(): JournalEntry[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
  const entries = (parsed as { entries?: JournalEntry[] }).entries;
  if (!Array.isArray(entries)) {
    throw new Error(`${JOURNAL_PATH} has no "entries" array.`);
  }
  return entries;
}

function usage(): never {
  console.error(
    "Usage: pnpm db:mark-applied [--dry-run] <tag>\n" +
      "Example: pnpm db:mark-applied 0008_material_thor\n\n" +
      "Only use this after applying a migration by hand with psql. See the file header for why.",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const tag = argv.find((arg) => !arg.startsWith("--"));
  if (!tag) usage();
  assertDevEnvironment("mark-migration-applied");

  const journal = readJournal();
  const filePath = path.join(MIGRATIONS_FOLDER, `${tag}.sql`);
  const fileSql = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;

  const { getDb, getDbClient } = await import("../lib/db");
  const db = getDb();
  try {
    const result = await db.execute(
      sql`select hash, created_at from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(
        MIGRATIONS_TABLE,
      )} order by created_at asc`,
    );
    const applied = readRows<AppliedRow>(result);
    const plan = planMark(tag, journal, applied, fileSql);

    if (plan.kind === "unknown-tag") {
      console.error(`No migration tagged "${tag}" in ${JOURNAL_PATH}.`);
      console.error(`Known tags: ${plan.known.join(", ")}`);
      process.exit(1);
    }

    if (plan.kind === "hash-mismatch") {
      console.error(
        `Refusing: "${tag}" is recorded in the journal under a different hash.\n` +
          `  recorded: ${plan.recorded}\n` +
          `  on disk:  ${plan.current}\n\n` +
          "The migration file changed after it was applied, so the database does not match the\n" +
          "repo. Editing an applied migration silently diverges every environment. Work out which\n" +
          "is right and either revert the file or write a new migration that corrects it.",
      );
      process.exit(1);
    }

    if (plan.kind === "already-marked") {
      console.log(
        `"${tag}" is already recorded in the journal (created_at=${plan.entry.when}). Nothing to do.`,
      );
      return;
    }

    if (plan.kind === "out-of-order") {
      console.error(
        `Refusing: a later migration is already recorded (created_at ${plan.later.join(", ")}), ` +
          `so "${tag}" is behind the chain.\n` +
          "The migrator only reads the newest row, so inserting here would not unblock anything.\n" +
          "Inspect drizzle.__drizzle_migrations and decide which history is correct before editing it.",
      );
      process.exit(1);
    }

    console.log(`Migration: ${tag}`);
    console.log(`  when:   ${plan.entry.when}`);
    console.log(`  sha256: ${plan.hash}`);
    console.log(`  ${plan.statements.length} statement(s):\n`);
    for (const [index, statement] of plan.statements.entries()) {
      const firstLine = statement.split("\n")[0] ?? "";
      const more = statement.includes("\n") ? ` … (+${statement.split("\n").length - 1} lines)` : "";
      console.log(`   ${index + 1}. ${firstLine}${more}`);
    }

    if (dryRun) {
      console.log("\n--dry-run: nothing written.");
      return;
    }

    console.log(
      "\nThis does NOT check that the database already has the above. Verify that first.",
    );
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Record "${tag}" as applied? [y/N] `);
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Aborted. Nothing written.");
      return;
    }

    await db.execute(
      sql`insert into ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(
        MIGRATIONS_TABLE,
      )} (hash, created_at) values(${plan.hash}, ${plan.entry.when})`,
    );
    console.log(`\nRecorded "${tag}". \`pnpm db:migrate\` will now skip it and continue.`);
  } finally {
    await getDbClient().end();
  }
}

// Only run when executed as a script. `planMark` is imported by mark-migration-applied.test.ts, and
// without this guard importing the module would start a prompt on stdin during the test run.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}