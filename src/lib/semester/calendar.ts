export type SemesterName = "harmattan" | "rain";

// Fixed 2025/26-session calendar (DESIGN.md §8). Update these dates when the
// next session's calendar is announced — this file is the single place to do it.
// Harmattan counts as active for lectures + exams together (Oct 20 → Feb 6);
// Rain for Feb 23 → Jul 3. Gaps fall back to the semester that just ended.
export const SESSION_CALENDAR = {
  harmattanStart: "2025-10-20",
  harmattanEnd: "2026-02-06",
  rainStart: "2026-02-23",
  rainEnd: "2026-07-03",
} as const;

function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

const HARMATTAN_START = utcDay(SESSION_CALENDAR.harmattanStart);
const HARMATTAN_END = utcDay(SESSION_CALENDAR.harmattanEnd);
const RAIN_START = utcDay(SESSION_CALENDAR.rainStart);
const RAIN_END = utcDay(SESSION_CALENDAR.rainEnd);

// Pure date logic so it can be unit-tested without touching the DB.
// Gaps between semesters resolve to whichever semester just ended
// (DESIGN.md §8); before the session starts and after Rain ends there is no
// "just ended" semester to fall back to, so Harmattan / Rain respectively win.
// Calendar dates are Nigerian local (Africa/Lagos, WAT UTC+1) — see window.ts.
const WAT_OFFSET_MS = 60 * 60 * 1000;

export function resolveSemesterForDate(date: Date): SemesterName {
  // Shift to WAT then take calendar date so 23:00 UTC → 00:00 WAT next day.
  const wat = new Date(date.getTime() + WAT_OFFSET_MS);
  const t = Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate());
  if (t <= HARMATTAN_START) return "harmattan";
  if (t <= HARMATTAN_END) return "harmattan";
  if (t < RAIN_START) return "harmattan";
  if (t <= RAIN_END) return "rain";
  return "rain";
}
