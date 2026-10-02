// Staff IDs are generated, never typed: STF-001, STF-002, ... (Board decision 2026-09-18).
//
// The old create form accepted any 1–50 character string, so rows with hand-typed identifiers
// already exist. Generation therefore has to *ignore* anything that isn't STF-<digits> rather
// than choke on it — see nextStaffNumber.

import { staffIdSchema } from "@/lib/validation/identifiers";

const PAD_WIDTH = 3;

/** STF-001, STF-042, and STF-1000 once the sequence outgrows the padding. */
export function formatStaffId(value: number): string {
  return `STF-${String(value).padStart(PAD_WIDTH, "0")}`;
}

export function isStaffId(value: string): boolean {
  return staffIdSchema.safeParse(value).success;
}

/**
 * The next free number, given every identifier already in use.
 *
 * Returns 1 when nothing parseable is present. Non-conforming identifiers (legacy hand-typed
 * ones, or anything else) are skipped — they can't tell us where the sequence is.
 */
export function nextStaffNumber(existing: readonly string[]): number {
  let highest = 0;
  for (const identifier of existing) {
    // Parse from the schema-validated string rather than a second local regex: one definition
    // of the format, so the generator can never drift from what the validator accepts.
    if (!isStaffId(identifier)) continue;
    const digits = identifier.trim().slice("STF-".length);
    const value = Number(digits);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }
  return highest + 1;
}

/** Convenience: the identifier to use for the next Teacher. */
export function nextStaffId(existing: readonly string[]): string {
  return formatStaffId(nextStaffNumber(existing));
}
