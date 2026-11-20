import type { QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";

/** Persistence IDs do not count as author edits. Client keys keep cards stable. */
export function draftFingerprint(payload: QuizDraftPayloadInput): string {
  return JSON.stringify(
    {
      details: payload.details,
      settings: payload.settings,
      questions: payload.questions.map((q) => ({ ...q, id: undefined })),
      passages: payload.passages.map((p) => ({ ...p, id: undefined })),
    },
    (_key: string, value: unknown) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
  );
}
export interface BuilderSaveResult {
  revision: number;
  status: "draft" | "published";
  questionIds: number[];
  passageIds: Record<string, number>;
}
/** A save must never replace text typed while its network request was in flight. */
export function reconcileSavedBuilder(
  current: QuizDraftPayloadInput,
  sent: QuizDraftPayloadInput,
  saved: BuilderSaveResult,
): QuizDraftPayloadInput {
  const ids = new Map(
    sent.questions.map((q, index) => [q.clientKey, saved.questionIds[index]]),
  );
  return {
    ...current,
    questions: current.questions.map((q) => ({ ...q, id: ids.get(q.clientKey) ?? q.id })),
    passages: current.passages.map((p) => ({
      ...p,
      id: saved.passageIds[p.clientKey] ?? p.id,
    })),
  };
}
