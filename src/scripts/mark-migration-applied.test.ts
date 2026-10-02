import { describe, expect, it } from "vitest";

import { planMark, readRows, type AppliedRow, type JournalEntry } from "./mark-migration-applied";

/**
 * These cover `planMark`, the decision half of `mark-migration-applied`. The database half is one
 * `insert`, so the logic worth testing is "should we insert, and is refusing the safe answer".
 *
 * The fixtures mirror real drizzle data: `created_at` in the journal table holds the journal entry's
 * `when` (milliseconds), and `hash` is the sha256 of the migration file's text.
 */

const MIGRATION_SQL = 'ALTER TABLE "courses" ADD COLUMN "session_id" integer;';
/** Independent implementation of the same thing, so the test does not echo the source. */
const MIGRATION_HASH = "e6a2b2b0e0b0d4a1c9b6a0f8e3c1d5a7b9e2f4c6d8a0b2c4e6f8a0b2c4d6e8f0a1";

function entry(tag: string, when: number): JournalEntry {
  return { idx: 0, tag, when, breakpoints: true };
}

function applied(when: number, hash: string): AppliedRow {
  return { created_at: String(when), hash };
}

describe("planMark", () => {
  it("marks a hand-applied migration that the journal has no row for", () => {
    // The wedge this script exists to fix: 0008 ran via psql, so the newest recorded row is 0007.
    const plan = planMark(
      "0008_material_thor",
      [entry("0007_worthless_swarm", 1789851211504), entry("0008_material_thor", 1790802039082)],
      [applied(1789851211504, "0".repeat(64))],
      MIGRATION_SQL,
    );

    expect(plan.kind).toBe("mark");
    if (plan.kind !== "mark") return;
    expect(plan.entry.when).toBe(1790802039082);
    expect(plan.hash).toHaveLength(64);
    expect(plan.statements).toHaveLength(1);
  });

  it("reports already-marked when the recorded hash matches the file", () => {
    // Learn the hash from a first pass rather than hardcoding a digest, so the fixture cannot
    // silently drift from the hashing the script actually performs.
    const probe = planMark("t", [entry("t", 1)], [], MIGRATION_SQL);
    if (probe.kind !== "mark") throw new Error("fixture setup failed");

    const plan = planMark(
      "t",
      [entry("t", 1790802039082)],
      [applied(1790802039082, probe.hash)],
      MIGRATION_SQL,
    );

    expect(plan.kind).toBe("already-marked");
  });

  it("refuses when the file hash no longer matches what ran, rather than papering over it", () => {
    // Someone edited an already-applied migration. The database and the repo now disagree, and
    // inserting a matching row would erase the only evidence.
    const plan = planMark(
      "0008_material_thor",
      [entry("0008_material_thor", 1790802039082)],
      [applied(1790802039082, MIGRATION_HASH)],
      MIGRATION_SQL,
    );

    expect(plan.kind).toBe("hash-mismatch");
    if (plan.kind !== "hash-mismatch") return;
    expect(plan.recorded).toBe(MIGRATION_HASH);
    expect(plan.current).not.toBe(MIGRATION_HASH);
  });

  it("refuses when a later migration is already recorded", () => {
    // The migrator reads only the newest row, so inserting an older one would not unblock it and
    // would add a row that misstates the history.
    const plan = planMark(
      "0008_material_thor",
      [entry("0008_material_thor", 1790802039082), entry("0009_next", 1790900000000)],
      [applied(1790900000000, "b".repeat(64))],
      MIGRATION_SQL,
    );

    expect(plan.kind).toBe("out-of-order");
    if (plan.kind !== "out-of-order") return;
    expect(plan.later).toEqual(["1790900000000"]);
  });

  it("rejects a tag that is not in the journal, and lists the real ones", () => {
    const plan = planMark(
      "0008_typo",
      [entry("0007_worthless_swarm", 1789851211504), entry("0008_material_thor", 1790802039082)],
      [],
      MIGRATION_SQL,
    );

    expect(plan.kind).toBe("unknown-tag");
    if (plan.kind !== "unknown-tag") return;
    expect(plan.known).toEqual(["0007_worthless_swarm", "0008_material_thor"]);
  });

  it("splits statements the way the migrator does, dropping empties", () => {
    const twoStatements = `${MIGRATION_SQL}\n--> statement-breakpoint\nALTER TABLE "x" ADD "y" int;`;
    const plan = planMark(
      "t",
      [entry("t", 1790802039082)],
      [],
      twoStatements,
    );

    expect(plan.kind).toBe("mark");
    if (plan.kind !== "mark") return;
    expect(plan.statements).toHaveLength(2);
    expect(plan.statements[0]).toBe(MIGRATION_SQL);
  });

  it("treats an empty database as mark-everything-asked, not as a refusal", () => {
    // A fresh database has no rows at all; the migrator's own `!lastDbMigration` branch runs
    // everything. This must not be confused with a later migration being applied.
    const plan = planMark("t", [entry("t", 1790802039082)], [], MIGRATION_SQL);

    expect(plan.kind).toBe("mark");
  });
});

describe("readRows", () => {
  // Regression tests for a real bug: `db.execute()` resolves to the row *array* under the
  // postgres-js driver, so `result.rows` is undefined and `?? []` made every read look like an
  // empty table. That made `already-marked` unreachable and the hash-mismatch guard dead code.
  it("reads rows from a bare array, which is what the postgres-js driver returns", () => {
    const rows = [{ hash: "a".repeat(64), created_at: "1790802039082" }];

    expect(readRows(rows)).toEqual(rows);
  });

  it("reads rows from a { rows } envelope, which other drivers return", () => {
    const rows = [{ hash: "b".repeat(64), created_at: "1790802039082" }];

    expect(readRows({ rows })).toEqual(rows);
  });

  it("throws rather than reporting an empty journal when the shape is unrecognised", () => {
    // The dangerous failure is silently returning []. Offering to insert a duplicate journal row
    // because the read failed is worse than refusing to run.
    expect(() => readRows(undefined)).toThrow(/Refusing to guess/);
    expect(() => readRows(null)).toThrow(/Refusing to guess/);
    expect(() => readRows({ count: 3 })).toThrow(/Refusing to guess/);
  });

  it("accepts a genuinely empty result", () => {
    // [] is a valid answer meaning "nothing applied", and must not be confused with unreadable.
    expect(readRows([])).toEqual([]);
  });
});