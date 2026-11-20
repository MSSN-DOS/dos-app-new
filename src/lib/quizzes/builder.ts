import type { z } from "zod";
import type {
  builderPassageDraftSchema,
  QuizQuestionDraftInput,
} from "@/lib/validation/quiz-questions";

export type BuilderQuestion = QuizQuestionDraftInput & { clientKey: string };
export type BuilderPassage = z.infer<typeof builderPassageDraftSchema>;
export type QuestionPreset =
  "true_false" | "options" | "fill_in_gap" | "essay" | "multi_answer" | "numeric";
export type BuilderBlock = {
  key: string;
  passage: BuilderPassage | null;
  questions: BuilderQuestion[];
};

export function newBuilderQuestion(
  preset: QuestionPreset,
  key: string,
  passageKey: string | null = null,
): BuilderQuestion {
  return {
    clientKey: key,
    passageKey,
    questionType: preset === "true_false" ? "options" : preset,
    bodyRichText: "",
    reasonRichText: "",
    marks: 1,
    numericAnswer: null,
    numericTolerance: 0,
    numericUnit: "",
    shuffleOptions: false,
    options:
      preset === "true_false"
        ? [
            { optionText: "<p>True</p>", isCorrect: false },
            { optionText: "<p>False</p>", isCorrect: false },
          ]
        : preset === "options" || preset === "multi_answer"
          ? [
              { optionText: "", isCorrect: false },
              { optionText: "", isCorrect: false },
            ]
          : [],
    blanks: preset === "fill_in_gap" ? [{ acceptedAnswer: "" }] : [],
  };
}

/** A passage moves as one block; its sub-questions retain their own order. */
export function builderBlocks(
  questions: readonly BuilderQuestion[],
  passages: readonly BuilderPassage[],
): BuilderBlock[] {
  const seen = new Set<string>();
  const blocks: BuilderBlock[] = [];
  for (const q of questions) {
    const passage = passages.find((p) => p.clientKey === q.passageKey);
    if (!passage) {
      blocks.push({ key: q.clientKey, passage: null, questions: [q] });
      continue;
    }
    if (seen.has(passage.clientKey)) continue;
    seen.add(passage.clientKey);
    blocks.push({
      key: passage.clientKey,
      passage,
      questions: questions.filter((s) => s.passageKey === passage.clientKey),
    });
  }
  for (const passage of passages) {
    if (!seen.has(passage.clientKey))
      blocks.push({ key: passage.clientKey, passage, questions: [] });
  }
  return blocks;
}

export function reorderByKey<T extends { key: string }>(
  rows: readonly T[],
  active: string,
  over: string,
): T[] {
  const from = rows.findIndex((r) => r.key === active);
  const to = rows.findIndex((r) => r.key === over);
  if (from < 0 || to < 0 || from === to) return [...rows];
  const result = [...rows];
  const [row] = result.splice(from, 1);
  result.splice(to, 0, row);
  return result;
}

/** Duplicates do not retain persistence IDs or share mutable answer arrays. */
export function duplicateBuilderQuestion(
  q: BuilderQuestion,
  key: string,
): BuilderQuestion {
  return {
    ...q,
    id: undefined,
    clientKey: key,
    options: q.options?.map((o) => ({ ...o })),
    blanks: q.blanks?.map((b) => ({ ...b })),
  };
}

export function questionTypeLabel(q: BuilderQuestion): string {
  if (q.questionType === "multi_answer") return "Multi-answer";
  if (q.questionType === "numeric") return "Numeric";
  if (q.questionType === "essay") return "Essay";
  if (q.questionType === "fill_in_gap") return "Fill in the gap";
  const labels = q.options?.map((o) =>
    o.optionText
      .replace(/<[^>]*>/g, "")
      .trim()
      .toLowerCase(),
  );
  return labels?.length === 2 && labels[0] === "true" && labels[1] === "false"
    ? "True / False"
    : "Multiple choice";
}
