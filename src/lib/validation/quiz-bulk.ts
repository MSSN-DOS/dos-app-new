import { z } from "zod";
import {
  newBuilderQuestion,
  type BuilderQuestion,
  type QuestionPreset,
} from "@/lib/quizzes/builder";
import { quizQuestionPublishSchema } from "./quiz-questions";
export const quizBulkSchema = z.object({
  type: z.enum([
    "options",
    "multi_answer",
    "fill_in_gap",
    "numeric",
    "true_false",
    "essay",
  ]),
  text: z.string().trim().min(1, "Paste at least one question").max(100000),
});
function escapedParagraph(value: string): string {
  return `<p>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")}</p>`;
}
export function parseQuizBulk(input: z.input<typeof quizBulkSchema>): {
  questions: BuilderQuestion[];
  errors: string[];
} {
  const parsed = quizBulkSchema.safeParse(input);
  if (!parsed.success)
    return { questions: [], errors: parsed.error.issues.map((issue) => issue.message) };
  const lines = parsed.data.text
    .split(/\r?\n/)
    .map((text, index) => ({ text, index }))
    .filter((line) => line.text.trim());
  if (lines.length > 100)
    return { questions: [], errors: ["Paste at most 100 questions at once"] };
  const questions: BuilderQuestion[] = [];
  const errors: string[] = [];
  for (const { text, index } of lines) {
    const [body, ...answers] = text
      .replaceAll("\\t", "\t")
      .split("\t")
      .map((part) => part.trim());
    const type: QuestionPreset = parsed.data.type;
    const q = newBuilderQuestion(type, `bulk-${index}`);
    q.bodyRichText = escapedParagraph(body);
    if (type === "fill_in_gap") {
      if (!body.includes("[gap]")) q.bodyRichText = escapedParagraph(`${body} [gap]`);
      q.blanks = answers.map((acceptedAnswer) => ({ acceptedAnswer }));
      if ((q.bodyRichText.match(/\[gap\]/g) ?? []).length !== answers.length)
        errors.push(`Line ${index + 1}: provide one answer column per [gap]`);
    } else if (type === "options" || type === "multi_answer")
      q.options = answers.map((answer) => ({
        isCorrect: answer.startsWith("*"),
        optionText: escapedParagraph(answer.replace(/^\*/, "")),
      }));
    else if (type === "numeric") {
      q.numericAnswer = answers[0] ? Number(answers[0]) : null;
      q.numericTolerance = answers[1] ? Number(answers[1]) : 0;
      q.numericUnit = answers[2] ?? "";
      if (answers.length > 3)
        errors.push(`Line ${index + 1}: use answer, tolerance and unit columns only`);
    } else if (type === "true_false") {
      const answer = answers[0]?.toLowerCase();
      q.options = q.options?.map((o, i) => ({
        ...o,
        isCorrect: answer === (i === 0 ? "true" : "false"),
      }));
      if (answers.length !== 1)
        errors.push(`Line ${index + 1}: supply one True or False answer`);
    }
    const valid = quizQuestionPublishSchema.safeParse(q);
    if (!valid.success)
      errors.push(
        ...valid.error.issues.map((issue) => `Line ${index + 1}: ${issue.message}`),
      );
    else questions.push({ ...valid.data, clientKey: q.clientKey });
  }
  return { questions: errors.length ? [] : questions, errors };
}
