// Course quizzes must start on a Saturday (quizCreateSchema enforces it). These helpers let the
// "New quiz" form offer the next one and flag a wrong date before the server does.

const LAGOS_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" });

/** The Saturday on or after `from`, as YYYY-MM-DD, counted in Africa/Lagos. */
export function nextSaturday(from: Date = new Date()): string {
  const today = Date.parse(`${LAGOS_DATE.format(from)}T00:00:00Z`);
  const dow = new Date(today).getUTCDay();
  const ahead = (6 - dow + 7) % 7;
  return new Date(today + ahead * 86_400_000).toISOString().slice(0, 10);
}

/** True for a YYYY-MM-DD string that falls on a Saturday (same check the server runs). */
export function isSaturday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).getUTCDay() === 6;
}
