/**
 * Duration helpers for the quiz details form.
 *
 * The form exposes three selects (hours / minutes / seconds) because that is how the
 * reference UI reads, but a quiz duration is stored as a single number. Seconds are
 * supported end to end: `quizzes.time_limit_minutes` cannot express a 90-second quiz,
 * so the settings migration adds `time_limit_seconds` and this module is the only
 * place that converts between the two shapes.
 */

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
}

const MAX_HOURS = 99;

/**
 * Ceiling the hour select can produce. The validation schema imports this rather
 * than restating a limit, so a value the form can display is never rejected on save.
 */
export const MAX_QUIZ_DURATION_SECONDS = MAX_HOURS * 3600 + 59 * 60 + 59;

function isIntInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Combines select values into total seconds.
 * Returns `null` for anything the selects should not be able to produce, so the
 * caller can surface a single field error instead of silently clamping.
 */
export function composeDurationSeconds(parts: DurationParts): number | null {
  const { hours, minutes, seconds } = parts;
  if (!isIntInRange(hours, 0, MAX_HOURS)) return null;
  if (!isIntInRange(minutes, 0, 59)) return null;
  if (!isIntInRange(seconds, 0, 59)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Same as `composeDurationSeconds`, except that an all-zero selection means "no time
 * limit" and becomes `null` — the stored shape for untimed. Invalid parts also collapse
 * to `null`; callers that need to tell "untimed" from "impossible" must use
 * `composeDurationSeconds` directly, which the selects cannot produce either way.
 */
export function durationSecondsFromParts(parts: DurationParts): number | null {
  const composed = composeDurationSeconds(parts);
  return composed === null || composed === 0 ? null : composed;
}

/** Inverse of `composeDurationSeconds`, for painting an existing quiz into the selects. */
export function splitDurationSeconds(totalSeconds: number): DurationParts {
  const safe = Number.isInteger(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

/** Human label used in summaries, e.g. "1h 15m" / "45s" / "2m". */
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds <= 0) return "No time limit";
  const { hours, minutes, seconds } = splitDurationSeconds(totalSeconds);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}
