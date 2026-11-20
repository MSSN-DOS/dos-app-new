/** Decimal/scientific input only; units are a separate display label. */
export function parseNumericAnswer(value: string | null | undefined): number | null {
  const text = value?.trim() ?? "";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function numericAnswerIsCorrect(
  value: string | null | undefined,
  expected: number | null | undefined,
  tolerance = 0,
): boolean {
  const answer = parseNumericAnswer(value);
  if (
    answer === null ||
    expected == null ||
    !Number.isFinite(expected) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  )
    return false;
  // Absorb floating-point rounding at the inclusive tolerance boundary.
  const rounding = Number.EPSILON * Math.max(1, Math.abs(answer), Math.abs(expected)) * 4;
  return Math.abs(answer - expected) <= tolerance + rounding;
}
