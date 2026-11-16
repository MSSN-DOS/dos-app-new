import { randomUUID } from "node:crypto";
import { and, asc, inArray } from "drizzle-orm";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { questionImages, quizImages } from "@/lib/db/schema";
import { quizImagePaths, resolveQuizRichText } from "@/lib/quizzes/images";
import { copyQuizImageObject, createQuizImageSignedUrl, removeQuizImageObject } from "@/lib/storage/supabase-storage";
import { editableQuiz } from "./quiz-builder";
import { ownedBankQuestion, readBankDocument } from "./question-bank";

export async function copyBankDocumentToQuiz(quizId: number, questionId: number, auth: AuthContext) {
  const db = getDb(); const quiz = await editableQuiz(db, quizId, auth);
  const doc = await readBankDocument(questionId, auth, false);
  if (doc.status !== "published") throw new QuizAuthoringError(422, "Publish this bank question before adding it to a quiz", [{ field: "questionId", message: "Only published bank questions can be copied" }]);
  if (quiz.courseId !== doc.courseId || quiz.jambSubjectId !== doc.jambSubjectId) throw new QuizAuthoringError(403, "Choose a bank question from this quiz's course or JAMB subject");
  const paths = [...new Set([...doc.passages.map(p => p.bodyRichText), ...doc.questions.flatMap(q => [q.bodyRichText, q.reasonRichText ?? "", ...(q.options ?? []).map(o => o.optionText)])].flatMap(quizImagePaths))];
  if (paths.length) {
    const owner = (await ownedBankQuestion(db, questionId, auth)).createdBy;
    const registered = await db.select().from(questionImages).where(and(inArray(questionImages.objectPath, paths), inArray(questionImages.createdBy, [...new Set([auth.userId, owner])]))).orderBy(asc(questionImages.id));
    if (paths.some(path => !registered.some(image => image.objectPath === path))) throw new QuizAuthoringError(403, "An image does not belong to this bank question");
  }
  const copied: { source: string; path: string; url: string }[] = [];
  try {
    for (const source of paths) {
      const path = `quizzes/${quizId}/${randomUUID()}.${source.split(".").pop()}`;
      await copyQuizImageObject(source, path);
      copied.push({ source, path, url: "" });
      copied[copied.length - 1].url = await createQuizImageSignedUrl(path);
    }
    if (copied.length) await db.insert(quizImages).values(copied.map(row => ({ quizId, objectPath: row.path, createdBy: auth.userId })));
  } catch (error) { for (const image of copied) await removeQuizImageObject(image.path); throw error; }
  const rich = (html: string) => {
    const original = new Map(copied.map(row => [row.source, row.url]));
    let result = resolveQuizRichText(html, original);
    for (const row of copied) result = result.replaceAll(`data-storage-path="${row.source}"`, `data-storage-path="${row.path}"`);
    return result;
  };
  const passageKey = doc.passages.length ? randomUUID() : null;
  return {
    questions: doc.questions.map(q => ({ ...q, id: undefined, clientKey: randomUUID(), passageKey, bodyRichText: rich(q.bodyRichText), reasonRichText: rich(q.reasonRichText ?? ""), options: q.options?.map(o => ({ ...o, optionText: rich(o.optionText) })) })),
    passages: doc.passages.map(p => ({ ...p, id: undefined, clientKey: passageKey!, bodyRichText: rich(p.bodyRichText) })),
  };
}
