import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { QuizAuthoringError } from "@/lib/api/quiz-authoring";
import type { AuthContext } from "@/lib/auth/guard";
import { forbiddenUnlessOwned } from "@/lib/auth/ownership";
import { getTeachingScope, isTrackAllowed } from "@/lib/auth/teaching-scope";
import { getDb, type Db } from "@/lib/db";
import {
  attemptAnswers,
  passages,
  questionBlanks,
  questionImages,
  questionOptions,
  questions,
  quizQuestions,
  topics,
} from "@/lib/db/schema";
import {
  persistQuizRichText,
  quizImageExtension,
  quizImagePaths,
  resolveQuizRichText,
} from "@/lib/quizzes/images";
import {
  createQuizImageSignedUrl,
  removeQuizImageObject,
  uploadQuizImageObject,
} from "@/lib/storage/supabase-storage";
import {
  bankDocumentSchema,
  type BankDocument,
  type BankDraft,
  type BankQuestionKind,
  type BankSave,
} from "@/lib/validation/question-bank";

/** Present a passage once in the bank; legacy consumers retain flat rows. */
export async function presentBankRows<
  T extends {
    id: number;
    passageId: number | null;
    questionType: BankDocument["questions"][number]["questionType"];
  },
>(db: Pick<Db, "select">, rows: T[]): Promise<(T & { kind: BankQuestionKind })[]> {
  const ids = rows
    .filter((q) => q.questionType === "options" && !q.passageId)
    .map((q) => q.id);
  const options = ids.length
    ? await db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, ids))
        .orderBy(asc(questionOptions.sortOrder))
    : [];
  const seen = new Set<number>();
  return rows.flatMap((q) => {
    if (q.passageId && seen.has(q.passageId)) return [];
    if (q.passageId) seen.add(q.passageId);
    const choices = options.filter((o) => o.questionId === q.id);
    const kind: BankQuestionKind = q.passageId
      ? "passage"
      : q.questionType === "options" &&
          choices.length === 2 &&
          choices[0].optionText.replace(/<[^>]*>/g, "").trim() === "True" &&
          choices[1].optionText.replace(/<[^>]*>/g, "").trim() === "False"
        ? "true_false"
        : q.questionType;
    return [{ ...q, kind }];
  });
}

export async function ownedBankQuestion(
  db: Pick<Db, "select">,
  id: number,
  auth: AuthContext,
) {
  const [q] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), isNull(questions.builderQuizId)))
    .limit(1);
  if (!q) throw new QuizAuthoringError(404, "Question not found");
  if (!forbiddenUnlessOwned(auth, q.createdBy))
    throw new QuizAuthoringError(403, "You can only edit your own bank questions");
  return q;
}
async function bankRows(db: Pick<Db, "select">, id: number, auth: AuthContext) {
  const q = await ownedBankQuestion(db, id, auth);
  const rows = q.passageId
    ? await db
        .select()
        .from(questions)
        .where(and(eq(questions.passageId, q.passageId), isNull(questions.builderQuizId)))
        .orderBy(asc(questions.id))
    : [q];
  if (rows.some((row) => row.createdBy !== q.createdBy))
    throw new QuizAuthoringError(
      409,
      "This passage contains questions with different owners",
    );
  return { root: rows[0], rows };
}
export async function assertBankUnreferenced(db: Pick<Db, "select">, ids: number[]) {
  if (!ids.length) return;
  const attached = await db
    .select({ id: quizQuestions.quizId })
    .from(quizQuestions)
    .where(inArray(quizQuestions.questionId, ids))
    .orderBy(asc(quizQuestions.quizId));
  if (attached.length)
    throw new QuizAuthoringError(
      409,
      "These bank questions are attached to quizzes. Remove their quiz attachments before changing or deleting them.",
    );
  const answers = await db
    .select({ id: attemptAnswers.attemptId })
    .from(attemptAnswers)
    .where(inArray(attemptAnswers.questionId, ids))
    .orderBy(asc(attemptAnswers.attemptId));
  if (answers.length)
    throw new QuizAuthoringError(
      409,
      "These bank questions have recorded attempt answers and cannot be changed or deleted.",
    );
}
const richTexts = (payload: BankDraft) => [
  ...payload.passages.map((p) => p.bodyRichText),
  ...payload.questions.flatMap((q) => [
    q.bodyRichText,
    q.reasonRichText ?? "",
    ...(q.options ?? []).map((o) => o.optionText),
  ]),
];
export async function bankImageLinks(auth: AuthContext, questionId?: number) {
  const db = getDb();
  const owner = questionId
    ? (await ownedBankQuestion(db, questionId, auth)).createdBy
    : auth.userId;
  const rows = await db
    .select()
    .from(questionImages)
    .where(inArray(questionImages.createdBy, [...new Set([auth.userId, owner])]))
    .orderBy(asc(questionImages.id));
  return Promise.all(
    rows.map(async (row) => ({
      path: row.objectPath,
      url: await createQuizImageSignedUrl(row.objectPath),
    })),
  );
}
export async function readBankDocument(
  id: number,
  auth: AuthContext,
  sign = true,
): Promise<BankDocument> {
  const db = getDb();
  const { root, rows } = await bankRows(db, id, auth);
  const ids = rows.map((q) => q.id);
  const options = await db
    .select()
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, ids))
    .orderBy(asc(questionOptions.sortOrder));
  const blanks = await db
    .select()
    .from(questionBlanks)
    .where(inArray(questionBlanks.questionId, ids))
    .orderBy(asc(questionBlanks.blankIndex));
  const shared = root.passageId
    ? await db.select().from(passages).where(eq(passages.id, root.passageId)).limit(1)
    : [];
  if (
    root.passageId &&
    (!shared[0] || shared[0].createdBy !== root.createdBy || shared[0].builderQuizId)
  )
    throw new QuizAuthoringError(
      403,
      "This passage does not belong to your bank document",
    );
  const payload = bankDocumentSchema.parse({
    id: root.id,
    revision: root.bankRevision ?? 0,
    status: root.status,
    kind: root.passageId
      ? "passage"
      : root.questionType === "options" &&
          options.length === 2 &&
          options[0].optionText.replace(/<[^>]*>/g, "").trim() === "True" &&
          options[1].optionText.replace(/<[^>]*>/g, "").trim() === "False"
        ? "true_false"
        : root.questionType,
    courseId: root.courseId,
    jambSubjectId: root.jambSubjectId,
    topicId: root.topicId,
    passages: shared.map((p) => ({
      id: p.id,
      clientKey: `p-${p.id}`,
      title: p.title ?? "",
      bodyRichText: p.bodyRichText,
    })),
    questions: rows.map((q) => ({
      id: q.id,
      clientKey: `q-${q.id}`,
      questionType: q.questionType,
      numericAnswer: q.numericAnswer ?? null,
      numericTolerance: q.numericTolerance ?? 0,
      numericUnit: q.numericUnit ?? "",
      shuffleOptions: q.shuffleOptions ?? false,
      bodyRichText: q.bodyRichText,
      reasonRichText: q.reasonRichText ?? "",
      passageKey: root.passageId ? `p-${root.passageId}` : null,
      marks: 1,
      options: options
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })),
      blanks: blanks
        .filter((b) => b.questionId === q.id)
        .map((b) => ({ acceptedAnswer: b.acceptedAnswer })),
    })),
  });
  if (!sign || !richTexts(payload).some((text) => quizImagePaths(text).length))
    return payload;
  const links = new Map(
    (await bankImageLinks(auth, root.id)).map((row) => [row.path, row.url]),
  );
  const rich = (text: string) => resolveQuizRichText(text, links);
  return {
    ...payload,
    passages: payload.passages.map((p) => ({ ...p, bodyRichText: rich(p.bodyRichText) })),
    questions: payload.questions.map((q) => ({
      ...q,
      bodyRichText: rich(q.bodyRichText),
      reasonRichText: rich(q.reasonRichText ?? ""),
      options: q.options?.map((o) => ({ ...o, optionText: rich(o.optionText) })),
    })),
  };
}
export async function saveBankDocument(
  auth: AuthContext,
  input: BankSave,
  id?: number,
): Promise<number> {
  return getDb().transaction(async (tx) => {
    const payload = input.payload;
    const existing = id ? await bankRows(tx, id, auth) : null;
    const owner = existing?.root.createdBy ?? auth.userId;
    const scope = await getTeachingScope(tx, auth);
    if (
      !isTrackAllowed(scope, payload) ||
      (existing && !isTrackAllowed(scope, existing.root))
    )
      throw new QuizAuthoringError(
        403,
        "This question is outside your teaching assignments",
      );
    if (payload.topicId) {
      const [topic] = await tx
        .select()
        .from(topics)
        .where(eq(topics.id, payload.topicId))
        .limit(1);
      if (!topic || topic.courseId !== payload.courseId)
        throw new QuizAuthoringError(422, "Choose a topic from the selected course", [
          { field: "topicId", message: "Topic must belong to this course" },
        ]);
    }
    if (existing) {
      if (existing.root.bankRevision !== input.revision)
        throw new QuizAuthoringError(
          409,
          "This question changed in another session. Reload before saving.",
        );
      await assertBankUnreferenced(
        tx,
        existing.rows.map((q) => q.id),
      );
      const [locked] = await tx
        .update(questions)
        .set({ bankRevision: input.revision + 1 })
        .where(
          and(
            eq(questions.id, existing.root.id),
            eq(questions.bankRevision, input.revision),
          ),
        )
        .returning({ id: questions.id });
      if (!locked)
        throw new QuizAuthoringError(
          409,
          "This question changed in another session. Reload before saving.",
        );
    }
    const ownedIds = new Set(existing?.rows.map((q) => q.id) ?? []);
    if (payload.questions.some((q) => q.id && !ownedIds.has(q.id)))
      throw new QuizAuthoringError(
        403,
        "A question ID does not belong to this bank document",
      );
    if (
      existing &&
      payload.kind !== "passage" &&
      payload.questions[0]?.questionType !== existing.root.questionType
    )
      throw new QuizAuthoringError(
        409,
        "The saved question type is fixed. Create a new question to use another type.",
      );
    const paths = [...new Set(richTexts(payload).flatMap(quizImagePaths))];
    if (paths.length) {
      const allowed = await tx
        .select()
        .from(questionImages)
        .where(
          and(
            inArray(questionImages.objectPath, paths),
            inArray(questionImages.createdBy, [...new Set([auth.userId, owner])]),
          ),
        )
        .orderBy(asc(questionImages.id));
      if (paths.some((path) => !allowed.some((image) => image.objectPath === path)))
        throw new QuizAuthoringError(
          422,
          "An image does not belong to this bank document",
          [{ field: "questions", message: "Upload images using your bank editor" }],
        );
    }
    const status =
      input.action === "publish" ? ("published" as const) : ("draft" as const);
    const track = {
      courseId: payload.courseId,
      jambSubjectId: payload.jambSubjectId,
      topicId: payload.topicId,
    };
    let passageId: number | null = null;
    if (payload.kind === "passage") {
      const p = payload.passages[0];
      if (p.id && p.id !== existing?.root.passageId)
        throw new QuizAuthoringError(
          403,
          "This passage does not belong to the bank document",
        );
      const values = {
        ...track,
        title: p.title ?? "",
        bodyRichText: persistQuizRichText(p.bodyRichText),
        status,
      };
      const [row] = existing?.root.passageId
        ? await tx
            .update(passages)
            .set(values)
            .where(eq(passages.id, existing.root.passageId))
            .returning({ id: passages.id })
        : await tx
            .insert(passages)
            .values({ ...values, createdBy: owner })
            .returning({ id: passages.id });
      passageId = row.id;
    }
    const saved: number[] = [];
    for (const q of payload.questions) {
      const values = {
        ...track,
        passageId,
        questionType: q.questionType,
        numericAnswer: q.numericAnswer,
        numericTolerance: q.numericTolerance,
        numericUnit: q.numericUnit,
        shuffleOptions: q.shuffleOptions,
        bodyRichText: persistQuizRichText(q.bodyRichText),
        reasonRichText: persistQuizRichText(q.reasonRichText ?? ""),
        status,
        bankRevision: input.revision + 1,
      };
      const [row] = q.id
        ? await tx
            .update(questions)
            .set(values)
            .where(eq(questions.id, q.id))
            .returning({ id: questions.id })
        : await tx
            .insert(questions)
            .values({ ...values, createdBy: owner })
            .returning({ id: questions.id });
      saved.push(row.id);
      await tx.delete(questionOptions).where(eq(questionOptions.questionId, row.id));
      await tx.delete(questionBlanks).where(eq(questionBlanks.questionId, row.id));
      if (
        (q.questionType === "options" || q.questionType === "multi_answer") &&
        q.options?.length
      )
        await tx
          .insert(questionOptions)
          .values(
            q.options.map((o, sortOrder) => ({
              questionId: row.id,
              optionText: persistQuizRichText(o.optionText),
              isCorrect: o.isCorrect,
              sortOrder,
            })),
          );
      if (q.questionType === "fill_in_gap" && q.blanks?.length)
        await tx
          .insert(questionBlanks)
          .values(
            q.blanks.map((b, index) => ({
              questionId: row.id,
              blankIndex: index + 1,
              acceptedAnswer: b.acceptedAnswer.trim(),
              caseSensitive: false,
            })),
          );
    }
    const removed =
      existing?.rows.filter((q) => !saved.includes(q.id)).map((q) => q.id) ?? [];
    if (removed.length) await tx.delete(questions).where(inArray(questions.id, removed));
    if (existing?.root.passageId && !passageId)
      await tx.delete(passages).where(eq(passages.id, existing.root.passageId));
    return Math.min(...saved);
  });
}
export async function deleteBankDocument(id: number, auth: AuthContext) {
  await getDb().transaction(async (tx) => {
    const { root, rows } = await bankRows(tx, id, auth);
    if (!isTrackAllowed(await getTeachingScope(tx, auth), root))
      throw new QuizAuthoringError(
        403,
        "This question is outside your teaching assignments",
      );
    const ids = rows.map((q) => q.id);
    await assertBankUnreferenced(tx, ids);
    await tx.delete(questions).where(inArray(questions.id, ids));
    if (root.passageId) await tx.delete(passages).where(eq(passages.id, root.passageId));
  });
}
export async function uploadBankImage(auth: AuthContext, file: Blob) {
  const db = getDb();
  const scope = await getTeachingScope(db, auth);
  if (!scope.unrestricted && !scope.courseIds.length && !scope.jambSubjectIds.length)
    throw new QuizAuthoringError(
      403,
      "You need an assigned subject to upload question images",
    );
  const ext = quizImageExtension(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!ext)
    throw new QuizAuthoringError(422, "This file is not a supported image", [
      { field: "file", message: "Choose a genuine PNG, JPEG or WebP image" },
    ]);
  const path = `question-bank/${auth.userId}/${randomUUID()}.${ext}`;
  await uploadQuizImageObject(path, file);
  try {
    await db.insert(questionImages).values({ objectPath: path, createdBy: auth.userId });
  } catch (error) {
    await removeQuizImageObject(path);
    throw error;
  }
  return { path, url: await createQuizImageSignedUrl(path) };
}
export async function removeBankImage(auth: AuthContext, path: string) {
  const db = getDb();
  const [image] = await db
    .select()
    .from(questionImages)
    .where(
      and(eq(questionImages.objectPath, path), eq(questionImages.createdBy, auth.userId)),
    )
    .limit(1);
  if (!image) throw new QuizAuthoringError(404, "Image not found");
  const [questionRows, passageRows] = await Promise.all([
    db
      .select({ body: questions.bodyRichText, reason: questions.reasonRichText })
      .from(questions)
      .orderBy(asc(questions.id)),
    db.select({ body: passages.bodyRichText }).from(passages).orderBy(asc(passages.id)),
  ]);
  const options = await db
    .select({ body: questionOptions.optionText })
    .from(questionOptions)
    .orderBy(asc(questionOptions.id));
  if (
    [
      ...questionRows.flatMap((q) => [q.body, q.reason ?? ""]),
      ...passageRows.map((p) => p.body),
      ...options.map((o) => o.body),
    ].some((text) => quizImagePaths(text).includes(path))
  )
    throw new QuizAuthoringError(
      409,
      "This image is referenced by bank questions, options or passages. Remove those references and save before deleting it.",
    );
  await removeQuizImageObject(path);
  await db.delete(questionImages).where(eq(questionImages.id, image.id));
}
