import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getTeachingScope, isTrackAllowed } from "@/lib/auth/teaching-scope";
import { getDb, type Db } from "@/lib/db";
import { passages, questionBlanks, questionOptions, questions, quizImages, quizQuestions, quizzes } from "@/lib/db/schema";
import { quizDraftPayloadSchema, quizPublishPayloadSchema, type QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";
import { focusLossPolicyFor, initialQuizSettings } from "@/lib/validation/quiz-settings";
import type { QuizBuilderSaveInput } from "@/lib/validation/quiz-builder";
import { persistQuizRichText, quizImagePaths, resolveQuizRichText } from "@/lib/quizzes/images";
import { createQuizImageSignedUrl } from "@/lib/storage/supabase-storage";

export type QuizRow = typeof quizzes.$inferSelect;
export async function ownedQuiz(db: Pick<Db, "select">, id: number, auth: AuthContext): Promise<QuizRow> {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!quiz) throw new QuizAuthoringError(404, "Quiz not found");
  if (!forbiddenUnlessOwned(auth, quiz.createdBy)) throw new QuizAuthoringError(403, "You can only edit quizzes you created");
  return quiz;
}
export async function editableQuiz(db: Pick<Db, "select">, id: number, auth: AuthContext): Promise<QuizRow> {
  const quiz = await ownedQuiz(db, id, auth);
  if (quiz.status === "published") throw new QuizAuthoringError(409, "This quiz is published and can no longer be edited");
  if (!isTrackAllowed(await getTeachingScope(db, auth), quiz)) throw new QuizAuthoringError(403, "This quiz is outside your teaching assignments");
  return quiz;
}
export function quizSettingsFromRow(quiz: QuizRow) {
  return {
    ...initialQuizSettings, visibility: quiz.visibility ?? "private", shuffleQuestions: quiz.shuffleQuestions ?? false,
    shuffleOptions: quiz.shuffleOptions ?? false, allowMultipleAttempts: quiz.allowMultipleAttempts ?? false,
    allowResume: quiz.allowResume ?? true, permitFocusLoss: quiz.loseFocusPolicy !== "warn" && quiz.loseFocusPolicy !== "auto_submit",
    autoNextQuestion: quiz.autoNextQuestion ?? false, requireLoginToAttempt: true as const,
    showAnswersAfter: quiz.showAnswersAfter ?? "after_release", showResultAfter: quiz.showResultAfter ?? "after_release",
    showCalculator: quiz.showCalculator ?? false, deductMarksForWrong: quiz.deductMarksForWrong ?? false,
    scheduleEnabled: quiz.scheduleEnabled || Boolean(quiz.opensAt || quiz.closesAt), opensAt: quiz.opensAt ?? null, closesAt: quiz.closesAt ?? null,
  };
}
export async function readQuizBuilder(db: Pick<Db, "select">, id: number, auth: AuthContext) {
  const quiz = await ownedQuiz(db, id, auth);
  const rows = await db.select({ id: questions.id, questionType: questions.questionType, bodyRichText: questions.bodyRichText, reasonRichText: questions.reasonRichText, passageId: questions.passageId, marks: quizQuestions.marks })
    .from(quizQuestions).innerJoin(questions, eq(quizQuestions.questionId, questions.id)).where(eq(quizQuestions.quizId, id)).orderBy(asc(quizQuestions.sortOrder), asc(questions.id));
  const ids = rows.map((r) => r.id);
  const options = ids.length ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.sortOrder)) : [];
  const blanks = ids.length ? await db.select().from(questionBlanks).where(inArray(questionBlanks.questionId, ids)).orderBy(asc(questionBlanks.blankIndex)) : [];
  const passageIds = rows.flatMap((q) => q.passageId ? [q.passageId] : []);
  const passageRows = await db.select().from(passages).where(passageIds.length ? or(inArray(passages.id, passageIds), eq(passages.builderQuizId, id)) : eq(passages.builderQuizId, id)).orderBy(asc(passages.id));
  const payload = quizDraftPayloadSchema.parse({
    details: { title: quiz.title, description: quiz.description, instructions: quiz.instructions, durationSeconds: quiz.timeLimitSeconds === undefined ? quiz.timeLimitMinutes == null ? null : quiz.timeLimitMinutes * 60 : quiz.timeLimitSeconds, passMark: quiz.passMark ?? 60, coverImagePath: quiz.coverImagePath ?? null },
    settings: quizSettingsFromRow(quiz),
    questions: rows.map((q, index) => ({ ...q, clientKey: `q-${q.id}`, passageKey: q.passageId ? `p-${q.passageId}` : null, marks: q.marks ?? 1, sortOrder: index, reasonRichText: q.reasonRichText ?? "", options: options.filter((o) => o.questionId === q.id).map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })), blanks: blanks.filter((b) => b.questionId === q.id).map((b) => ({ acceptedAnswer: b.acceptedAnswer })) })),
    passages: passageRows.map((p) => ({ id: p.id, clientKey: `p-${p.id}`, title: p.title ?? "", bodyRichText: p.bodyRichText })),
  });
  return { quiz, payload };
}
export async function signBuilderPayload(db: Db, id: number, payload: QuizDraftPayloadInput): Promise<QuizDraftPayloadInput & { coverImageUrl: string | null }> {
  const images = await db.select().from(quizImages).where(eq(quizImages.quizId, id)).orderBy(asc(quizImages.id));
  const urls = new Map(await Promise.all(images.map(async (image) => [image.objectPath, await createQuizImageSignedUrl(image.objectPath)] as const)));
  const rich = (html: string | null | undefined) => resolveQuizRichText(html ?? "", urls);
  return { ...payload, coverImageUrl: payload.details.coverImagePath ? urls.get(payload.details.coverImagePath) ?? null : null,
    details: { ...payload.details, description: rich(payload.details.description), instructions: rich(payload.details.instructions) },
    questions: payload.questions.map((q) => ({ ...q, bodyRichText: rich(q.bodyRichText), reasonRichText: rich(q.reasonRichText), options: q.options?.map((o) => ({ ...o, optionText: rich(o.optionText) })) })),
    passages: payload.passages.map((p) => ({ ...p, bodyRichText: rich(p.bodyRichText) })),
  };
}
export function validateQuizPublish(payload: QuizDraftPayloadInput, quizType: string): void {
  quizPublishPayloadSchema.parse(payload);
  if (quizType === "course" && payload.questions.length !== 50) throw new QuizAuthoringError(422, "Course quizzes require exactly 50 questions", [{ field: "questions", message: `Add exactly 50 questions (${payload.questions.length} currently)` }]);
}
export async function saveQuizBuilder(id: number, auth: AuthContext, input: QuizBuilderSaveInput): Promise<void> {
  await getDb().transaction(async (tx) => {
    const quiz = await editableQuiz(tx, id, auth);
    if (input.action === "publish") validateQuizPublish(input.payload, quiz.quizType);
    const payload = input.payload;
    const images = await tx.select().from(quizImages).where(eq(quizImages.quizId, id)).orderBy(asc(quizImages.id));
    const allowedImages = new Set(images.map((image) => image.objectPath));
    const richTexts = [payload.details.description ?? "", payload.details.instructions ?? "", ...payload.passages.map((p) => p.bodyRichText), ...payload.questions.flatMap((q) => [q.bodyRichText, q.reasonRichText ?? "", ...(q.options ?? []).map((o) => o.optionText)])];
    const paths = [...richTexts.flatMap(quizImagePaths), ...(payload.details.coverImagePath ? [payload.details.coverImagePath] : [])];
    if (paths.some((path) => !allowedImages.has(path))) throw new QuizAuthoringError(422, "An image does not belong to this quiz", [{ field: "details.coverImagePath", message: "Upload images to this quiz before saving" }]);
    const settings = payload.settings;
    const { visibility: _visibility, scheduleEnabled, permitFocusLoss, ...settingsColumns } = settings;
    void _visibility;
    const [updated] = await tx.update(quizzes).set({
      title: payload.details.title, description: persistQuizRichText(payload.details.description ?? ""), instructions: persistQuizRichText(payload.details.instructions ?? ""),
      coverImagePath: payload.details.coverImagePath, passMark: payload.details.passMark,
      timeLimitSeconds: payload.details.durationSeconds, timeLimitMinutes: payload.details.durationSeconds == null ? null : Math.ceil(payload.details.durationSeconds / 60),
      questionCount: quiz.quizType === "course" ? 50 : payload.questions.length,
      ...settingsColumns, scheduleEnabled, loseFocusPolicy: focusLossPolicyFor(permitFocusLoss),
      status: input.action === "publish" ? "published" : "draft", builderRevision: input.revision + 1,
    }).where(and(eq(quizzes.id, id), eq(quizzes.builderRevision, input.revision), eq(quizzes.status, "draft"))).returning({ id: quizzes.id });
    if (!updated) throw new QuizAuthoringError(409, "This quiz changed in another session. Reload before saving.");
    const status: "published" | "draft" = input.action === "publish" ? "published" : "draft";
    const track = { courseId: quiz.courseId, jambSubjectId: quiz.jambSubjectId, topicId: quiz.topicId, builderQuizId: id };
    const savedPassages = await tx.select().from(passages).where(eq(passages.builderQuizId, id)).orderBy(asc(passages.id));
    const passageMap = new Map<string, number>();
    for (const p of payload.passages) {
      const values = { ...track, title: p.title, bodyRichText: persistQuizRichText(p.bodyRichText), status };
      const [row] = p.id && savedPassages.some((s) => s.id === p.id)
        ? await tx.update(passages).set(values).where(eq(passages.id, p.id)).returning({ id: passages.id })
        : await tx.insert(passages).values({ ...values, createdBy: auth.userId }).returning({ id: passages.id });
      passageMap.set(p.clientKey, row.id);
    }
    const savedQuestions = await tx.select().from(questions).where(eq(questions.builderQuizId, id)).orderBy(asc(questions.id));
    const ownedIds = new Set(savedQuestions.map((q) => q.id));
    const values = payload.questions.map((q) => ({
      ...track, id: q.id && ownedIds.has(q.id) ? q.id : undefined,
      createdBy: auth.userId, questionType: q.questionType,
      bodyRichText: persistQuizRichText(q.bodyRichText), reasonRichText: persistQuizRichText(q.reasonRichText ?? ""),
      passageId: q.passageKey ? passageMap.get(q.passageKey) ?? null : null, status,
    }));
    // Batch writes keep full Course Quiz saves within remote request limits.
    // Foreign/bank question IDs are copied, never modified by this upsert.
    const rows = values.length ? await tx.insert(questions).values(values).onConflictDoUpdate({ target: questions.id, set: {
      questionType: sql`excluded.question_type`, bodyRichText: sql`excluded.body_rich_text`,
      reasonRichText: sql`excluded.reason_rich_text`, passageId: sql`excluded.passage_id`, status,
    } }).returning({ id: questions.id }) : [];
    // Serial defaults allocate new IDs in VALUES order; existing IDs stay stable.
    // Sort the new IDs so attachment order is independent of RETURNING row order.
    const createdIds = rows.filter((q) => !ownedIds.has(q.id)).map((q) => q.id).sort((a, b) => a - b);
    let createdIndex = 0;
    const newIds = values.map((q) => q.id ?? createdIds[createdIndex++]);
    await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, id));
    if (newIds.length) {
      await tx.delete(questionOptions).where(inArray(questionOptions.questionId, newIds));
      await tx.delete(questionBlanks).where(inArray(questionBlanks.questionId, newIds));
      const options = payload.questions.flatMap((q, index) => q.questionType === "options" ? (q.options ?? []).map((o, sortOrder) => ({ questionId: newIds[index], optionText: persistQuizRichText(o.optionText), isCorrect: o.isCorrect, sortOrder })) : []);
      const blanks = payload.questions.flatMap((q, index) => q.questionType === "fill_in_gap" ? (q.blanks ?? []).map((b, i) => ({ questionId: newIds[index], acceptedAnswer: b.acceptedAnswer, blankIndex: i + 1, caseSensitive: false })) : []);
      if (options.length) await tx.insert(questionOptions).values(options);
      if (blanks.length) await tx.insert(questionBlanks).values(blanks);
      await tx.insert(quizQuestions).values(payload.questions.map((q, index) => ({ quizId: id, questionId: newIds[index], sortOrder: index, marks: q.marks })));
    }
    const removed = savedQuestions.filter((q) => !newIds.includes(q.id)).map((q) => q.id);
    if (removed.length) await tx.delete(questions).where(inArray(questions.id, removed));
    const removedPassages = savedPassages.filter((p) => ![...passageMap.values()].includes(p.id)).map((p) => p.id);
    if (removedPassages.length) await tx.delete(passages).where(inArray(passages.id, removedPassages));
  });
}

export async function publishStoredQuiz(id: number, auth: AuthContext): Promise<void> {
  await getDb().transaction(async (tx) => {
    const { quiz, payload } = await readQuizBuilder(tx, id, auth);
    if (quiz.status === "published") throw new QuizAuthoringError(409, "This quiz is already published");
    if (!isTrackAllowed(await getTeachingScope(tx, auth), quiz)) throw new QuizAuthoringError(403, "This quiz is outside your teaching assignments");
    validateQuizPublish(payload, quiz.quizType);
    const [updated] = await tx.update(quizzes).set({ status: "published", builderRevision: (quiz.builderRevision ?? 0) + 1 }).where(and(eq(quizzes.id, id), eq(quizzes.status, "draft"), eq(quizzes.builderRevision, quiz.builderRevision ?? 0))).returning({ id: quizzes.id });
    if (!updated) throw new QuizAuthoringError(409, "This quiz changed in another session. Reload before publishing.");
    await tx.update(questions).set({ status: "published" }).where(eq(questions.builderQuizId, id));
    await tx.update(passages).set({ status: "published" }).where(eq(passages.builderQuizId, id));
  });
}
