// Pure parser for the teacher bulk-add paste box: one question per line, columns
// separated by tab characters. For fill-in-gap rows the columns after the text
// are accepted answers (one per blank); for options rows they are the options,
// with the single correct option prefixed by "*". Kept pure so the paste format's
// rules are unit-tested — the dialog only renders the result.

export type BulkRow =
  | { kind: "fill"; line: number; body: string; answers: string[]; errors: string[] }
  | {
      kind: "options";
      line: number;
      body: string;
      options: { text: string; correct: boolean }[];
      errors: string[];
    };

export type BulkQuestionType = "fill_in_gap" | "options";

export const BULK_ROW_LIMIT = 50;

export function parseBulkRows(
  text: string,
  type: BulkQuestionType,
): { rows: BulkRow[]; ignored: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rows = lines.slice(0, BULK_ROW_LIMIT).map((line, idx) => {
    const parts = line.split("\t").map((p) => p.trim());
    const body = parts[0] ?? "";
    const errors: string[] = [];
    if (body === "") errors.push("No question text");
    else if (body.length > 20000) errors.push("Question text over 20,000 characters");

    if (type === "options") {
      const options = parts.slice(1).map((p) => {
        const correct = p.startsWith("*");
        return { text: correct ? p.slice(1).trim() : p, correct };
      });
      if (options.length < 2) errors.push("Add at least two options (press Tab between them)");
      if (options.some((o) => o.text === "")) errors.push("Every option needs text");
      const correctCount = options.filter((o) => o.correct).length;
      if (correctCount === 0) errors.push("Mark the correct option by starting it with *");
      else if (correctCount > 1) errors.push("Only one option may be marked with *");
      options.forEach((o, i) => {
        if (o.text.length > 1000) errors.push(`Option ${i + 1} over 1,000 characters`);
      });
      return { kind: "options" as const, line: idx + 1, body, options, errors };
    }

    const answers = parts.slice(1);
    if (answers.length === 0) errors.push("Press Tab, then type the accepted answer");
    answers.forEach((a, i) => {
      if (a === "") errors.push(`Answer ${i + 1} is empty`);
      else if (a.length > 255) errors.push(`Answer ${i + 1} over 255 characters`);
    });
    return { kind: "fill" as const, line: idx + 1, body, answers, errors };
  });
  return { rows, ignored: Math.max(0, lines.length - BULK_ROW_LIMIT) };
}
