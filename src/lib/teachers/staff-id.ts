// Staff IDs are generated, never typed: STF-001, STF-002, ... (Board decision 2026-09-18).
//
// The old create form accepted any 1–50 character string, so rows with hand-typed identifiers
// already exist. Generation therefore has to *ignore* anything that isn't STF-<digits> rather
// than choke on it — see nextStaffNumber.

const STAFF_ID_PATTERN = /^STF-(\d+)$/;
const PAD_WIDTH = 3;

/** STF-001, STF-042, and STF-1000 once the sequence outgrows the padding. */
export function formatStaffId(value: number): string {
  return `STF-${String(value).padStart(PAD_WIDTH, "0")}`;
}

export function isStaffId(value: string): boolean {
  return STAFF_ID_PATTERN.test(value.trim());
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
    const match = STAFF_ID_PATTERN.exec(identifier.trim());
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }
  return highest + 1;
}

/** Convenience: the identifier to use for the next Teacher. */
export function nextStaffId(existing: readonly string[]): string {
  return formatStaffId(nextStaffNumber(existing));
}
