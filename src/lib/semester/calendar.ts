export type SemesterName = "harmattan" | "rain";

/**
 * The four dates that bound a session, plus its label. Structurally a subset of a `sessions`
 * row (DESIGN.md §8, amended 2026-09-30) — the resolver takes this shape, not the table, so the
 * date logic stays pure and unit-testable without a database.
 *
 * `date` columns come back from Drizzle as `YYYY-MM-DD` strings, which is why these are strings
 * and not `Date`s: comparing two of them is a plain lexicographic compare, no timezone.
 */
export type SessionDates = {
  id: number;
  label: string;
  harmattanStart: string;
  harmattanEnd: string;
  rainStart: string;
  rainEnd: string;
};

/** What the resolver hands back: which session, which semester inside it, and how it decided. */
export type ActiveSemester = {
  semester: SemesterName;
  sessionId: number;
  sessionLabel: string;
  source: "auto" | "manual";
};

/**
 * The two things a resolver result can be, beyond the happy path. `no-session` means today falls
 * outside every session ever entered — a real state now that sessions are data, and the admin UI
 * surfaces it instead of guessing. `manual` means an Admin forced it via the override.
 */
export type ResolvedSemester =
  | ({ ok: true } & ActiveSemester)
  | { ok: false; reason: "no-session"; source: "auto" };

// Calendar dates are Nigerian local (Africa/Lagos, WAT UTC+1) — see window.ts. Shift to WAT then
// take the calendar date so 23:00 UTC on the day before a start date still counts as that date.
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** The YAT (WAT calendar date) of a `Date`, as a `YYYY-MM-DD` string. */
function watDay(date: Date): string {
  const wat = new Date(date.getTime() + WAT_OFFSET_MS);
  return `${wat.getUTCFullYear()}-${String(wat.getUTCMonth() + 1).padStart(2, "0")}-${String(
    wat.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Which semester is running inside a session, given today.
 *
 * Collapses to `t < rainStart ? "harmattan" : "rain"`, which is correct for all four regions:
 * the Harmattan span, the Harmattan exams, the gap between semesters (falls back to the
 * semester that just ended, so students are not shown an empty state), and the long tail after
 * Rain ends (also "the semester that just ended"). The old version wrote this as five branches
 * where three were redundant; the redundancy hid a real bug (after `rainEnd` it kept returning
 * `rain` with no way to say "no session"), which is why it is now scoped to a session instead of
 * to a hardcoded year.
 *
 * The comparison is strict on `rainStart`: Rain's first day is Rain. `<=` here — the obvious
 * first guess — hides Rain for exactly one day a session, which is the day Rain actually
 * begins.
 */
export function resolveSemesterWithinSession(
  date: Date,
  session: SessionDates,
): SemesterName {
  return watDay(date) < session.rainStart ? "harmattan" : "rain";
}

/**
 * Pick the session today falls in.
 *
 * Two cases, in order:
 *  1. Today is inside `[harmattanStart, rainEnd]` of some session — use it.
 *  2. Today is in a gap between sessions (the long summer, or before the very first session
 *     ever recorded). No session contains today, so fall back to the most recent session that
 *     has already started, and resolve inside it — which lands on Rain, i.e. the semester that
 *     just ended. This is DESIGN.md §8's gap rule generalised from "between semesters" to
 *     "between sessions", and it is what keeps September students looking at the material they
 *     just sat rather than at an empty state.
 *
 * Returns `null` only when no session has started at all — a genuine "we have no calendar for
 * this date" state, which is a thing the Admin must fix, not something to paper over.
 */
export function pickSessionForDate(
  sessions: SessionDates[],
  date: Date,
): { session: SessionDates; semester: SemesterName } | null {
  const today = watDay(date);
  if (sessions.length === 0) return null;

  const started = sessions
    .filter((s) => s.harmattanStart <= today)
    .sort((a, b) => (a.harmattanStart < b.harmattanStart ? -1 : 1));

  if (started.length === 0) return null;

  // The session whose full window spans today, if one does. `started` is ascending by start date
  // and `find` returns the first match, so with the non-overlapping calendar this is the only
  // candidate; were two sessions ever to overlap, this would take the earlier one.
  const containing = started.find(
    (s) => s.harmattanStart <= today && today <= s.rainEnd,
  );
  // Fallback when today sits in the gap after a session's Rain semester ended: the newest session
  // that has started. That is the closest one that could be the intended current session, and
  // `resolveSemesterWithinSession` below then reports the gap-fallback semester for it.
  const session = containing ?? started[started.length - 1]!;
  return { session, semester: resolveSemesterWithinSession(date, session) };
}
