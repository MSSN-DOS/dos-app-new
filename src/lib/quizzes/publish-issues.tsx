import type { QuizPublishBlocker } from "@/lib/validation/quiz-questions";

/** Where the editor should take the author to fix a publish blocker. */
export type IssueTarget =
  | { kind: "question"; index: number }
  | { kind: "passage"; index: number }
  | { kind: "title" }
  | { kind: "settings" }
  | { kind: "list" };

const isIndex = (value: string | undefined): value is string => /^\d+$/.test(value ?? "");

/** Map a blocker's dotted payload path (`questions.2.options`, `details.title`…) to a place in the editor. */
export function issueTarget(path: string): IssueTarget {
  const [root, second] = path.split(".");
  if (root === "questions" && isIndex(second))
    return { kind: "question", index: Number(second) };
  if (root === "passages" && isIndex(second))
    return { kind: "passage", index: Number(second) };
  if (root === "details" && second === "title") return { kind: "title" };
  if (root === "details" || root === "settings") return { kind: "settings" };
  return { kind: "list" };
}

export function issueLabel(issue: QuizPublishBlocker): string {
  const [root, second] = issue.path.split(".");
  const prefix =
    root === "questions" && isIndex(second)
      ? `Question ${Number(second) + 1}: `
      : root === "passages" && isIndex(second)
        ? `Passage ${Number(second) + 1}: `
        : "";
  return `${prefix}${issue.message}`;
}

/** "37 of 50" progress for a quiz with a fixed question count. */
export function questionProgress(count: number, required: number) {
  return {
    label: `${count} of ${required} questions`,
    percent: Math.min(100, Math.round((count / required) * 100)),
    over: Math.max(0, count - required),
    remaining: Math.max(0, required - count),
  };
}
