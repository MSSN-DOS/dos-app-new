import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { quizImages } from "@/lib/db/schema";
import { editableQuiz, readQuizBuilder } from "./quiz-builder";
import { MAX_QUIZ_IMAGE_BYTES, quizImageExtension, quizImagePaths } from "@/lib/quizzes/images";
import { createQuizImageSignedUrl, removeQuizImageObject, uploadQuizImageObject } from "@/lib/storage/supabase-storage";

export async function uploadBuilderImage(id: number, auth: AuthContext, file: Blob) {
  const db = getDb(); await editableQuiz(db, id, auth);
  if (file.size === 0 || file.size > MAX_QUIZ_IMAGE_BYTES) throw new QuizAuthoringError(422, "Choose an image up to 5 MB", [{ field: "file", message: "Image must be between 1 byte and 5 MB" }]);
  const extension = quizImageExtension(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!extension) throw new QuizAuthoringError(422, "Choose a PNG, JPEG or WebP image", [{ field: "file", message: "Unsupported or mislabeled image" }]);
  const path = `quizzes/${id}/${randomUUID()}.${extension}`;
  await uploadQuizImageObject(path, file);
  try { await db.insert(quizImages).values({ quizId: id, objectPath: path, createdBy: auth.userId }); }
  catch (error) { await removeQuizImageObject(path); throw error; }
  return { path, url: await createQuizImageSignedUrl(path) };
}
export async function removeBuilderImage(id: number, auth: AuthContext, path: string) {
  const db = getDb(); await editableQuiz(db, id, auth);
  const rows = await db.select().from(quizImages).where(eq(quizImages.quizId, id)).orderBy(asc(quizImages.id));
  const image = rows.find((r) => r.objectPath === path);
  if (!image) throw new QuizAuthoringError(404, "Quiz image not found");
  const { payload } = await readQuizBuilder(db, id, auth);
  const texts = [payload.details.description ?? "", payload.details.instructions ?? "", ...payload.passages.map((p) => p.bodyRichText), ...payload.questions.flatMap((q) => [q.bodyRichText, q.reasonRichText ?? "", ...(q.options ?? []).map((o) => o.optionText)])];
  if (payload.details.coverImagePath === path || texts.some((html) => quizImagePaths(html).includes(path))) throw new QuizAuthoringError(409, "The quiz cover or rich-text content still uses this image. Save its removal first.");
  await removeQuizImageObject(path); await db.delete(quizImages).where(eq(quizImages.id, image.id));
}
