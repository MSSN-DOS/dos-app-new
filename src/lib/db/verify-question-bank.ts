/** Opt-in real-route verification. Requires the explicitly confirmed development
 * database: pnpm exec tsx src/lib/db/verify-question-bank.ts --development.
 * Synthetic records/objects are cleaned by exact IDs. Never run in production.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb, getDbClient } from "@/lib/db";
import { roles, users, jambSubjects, teacherSubjects, questions, questionImages, passages, quizzes, quizQuestions, quizImages, quizAttempts } from "@/lib/db/schema";
import { signSession } from "@/lib/auth/jwt";
import { newBuilderQuestion } from "@/lib/quizzes/builder";
import { bankDocumentSchema, type BankDocument } from "@/lib/validation/question-bank";
import { removeQuizImageObject } from "@/lib/storage/supabase-storage";
import * as documents from "@/app/api/teacher/questions/documents/route";
import * as document from "@/app/api/teacher/questions/[id]/document/route";
import * as images from "@/app/api/teacher/question-images/route";
import * as quizApi from "@/app/api/teacher/quizzes/route";
import * as builderApi from "@/app/api/teacher/quizzes/[id]/builder/route";
import * as copyApi from "@/app/api/teacher/quizzes/[id]/bank-copy/route";
import { quizBuilderDocumentSchema } from "@/lib/validation/quiz-builder";
class Failure extends Error {}
function check(value: unknown, message: string): asserts value { if (!value) throw new Failure(message); }
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call<T>(handler: Handler, method: string, token: string | null, body?: unknown, id = 1, expected = 200): Promise<T> {
  const headers = new Headers(); if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
  const request = new Request(`http://localhost/api/verify/${id}`, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const res = await handler(request, { params: Promise.resolve({ id: String(id) }) });
  check(res.status === expected, `${method} expected ${expected}, received ${res.status}`);
  return res.status === 204 ? undefined as T : await res.json() as T;
}
const prefix = `SYNTHETIC-BANK-${randomUUID().slice(0, 8)}`;
const manifest = { userIds: [] as number[], bankIds: [] as number[], quizIds: [] as number[], subjectId: 0 };
const manifestPath = join(tmpdir(), `${prefix}.json`);
const checkpoint = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest));
async function cleanupBankRun(records: typeof manifest, recoveryPath: string) {
  const db = getDb(); const { userIds, quizIds, bankIds } = records;
  if (quizIds.length) {
    const media = await db.select().from(quizImages).where(inArray(quizImages.quizId, quizIds));
    for (const image of media) await removeQuizImageObject(image.objectPath);
    await db.delete(quizAttempts).where(inArray(quizAttempts.quizId, quizIds));
    await db.delete(quizQuestions).where(inArray(quizQuestions.quizId, quizIds));
    await db.delete(questions).where(inArray(questions.builderQuizId, quizIds));
    await db.delete(passages).where(inArray(passages.builderQuizId, quizIds));
    await db.delete(quizzes).where(inArray(quizzes.id, quizIds));
  }
  if (bankIds.length) await db.delete(questions).where(inArray(questions.id, bankIds));
  if (userIds.length) {
    await db.delete(passages).where(inArray(passages.createdBy, userIds));
    const media = await db.select().from(questionImages).where(inArray(questionImages.createdBy, userIds));
    for (const image of media) await removeQuizImageObject(image.objectPath);
    await db.delete(questionImages).where(inArray(questionImages.createdBy, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  if (records.subjectId) await db.delete(jambSubjects).where(eq(jambSubjects.id, records.subjectId));
  if (fs.existsSync(recoveryPath)) fs.unlinkSync(recoveryPath);
  await getDbClient().end(); console.log("Cleaned this run's synthetic bank records and Storage objects.");
}
async function main() {
  check(process.argv.includes("--development"), "Requires --development and a confirmed development database");
  console.log("Checking: development bank fixtures");
  process.loadEnvFile(".env.local"); const db = getDb();
  const recoveryName = process.argv.find(arg => arg.startsWith("--recover="))?.slice("--recover=".length);
  if (recoveryName) {
    check(/^SYNTHETIC-BANK-[a-f0-9]{8}\.json$/.test(recoveryName), "Only a bank verification manifest in the temporary directory can be recovered");
    const recoveryPath = join(tmpdir(), recoveryName);
    const ids = z.array(z.number().int().positive());
    const records = z.object({ userIds: ids, bankIds: ids, quizIds: ids, subjectId: z.number().int().nonnegative() }).parse(JSON.parse(fs.readFileSync(recoveryPath, "utf8")));
    if (records.userIds.length) {
      const owned = await db.select({ id: users.id, identifier: users.identifier }).from(users).where(inArray(users.id, records.userIds));
      check(owned.every(user => user.identifier.startsWith(recoveryName.replace(".json", "") + "-")), "Recovery contains a non-synthetic account");
    }
    await cleanupBankRun(records, recoveryPath); return;
  }
  try {
    const roleRows = await db.select().from(roles);
    const sessions = new Map<string, string>();
    for (const name of ["teacher", "admin", "aspirant"] as const) {
      const role = roleRows.find(r => r.name === name); check(role, "Seed roles before verification");
      const [user] = await db.insert(users).values({ identifier: `${prefix}-${name}`, identifierType: name === "aspirant" ? "jamb_reg_number" : "staff_id", fullName: `${prefix} ${name}`, roleId: role.id, passwordHash: "synthetic-unused-password" }).returning();
      manifest.userIds.push(user.id); checkpoint(); sessions.set(name, await signSession({ userId: user.id, roleId: role.id }));
    }
    const token = sessions.get("teacher")!;
    const [subject] = await db.insert(jambSubjects).values({ name: prefix }).returning(); manifest.subjectId = subject.id; checkpoint();
    await db.insert(teacherSubjects).values({ userId: manifest.userIds[0], jambSubjectId: subject.id });
    const form = new FormData(); form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKAAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "diagram.png");
    const image = (await call<{ data: { path: string; url: string } }>(images.POST, "POST", token, form, 1, 201)).data;
    check((await fetch(image.url, { signal: AbortSignal.timeout(30000) })).ok, "Private image download failed");
    const graphic = `<img src="${image.url}" data-storage-path="${image.path}" alt="Diagram">`;
    const docs: BankDocument[] = [];
    for (const kind of ["true_false", "options", "fill_in_gap", "passage", "essay"] as const) {
      const q = newBuilderQuestion(kind === "passage" ? "fill_in_gap" : kind, randomUUID(), kind === "passage" ? "p" : null);
      const payload = { kind, jambSubjectId: subject.id, questions: [q], passages: kind === "passage" ? [{ clientKey: "p", bodyRichText: "" }] : [] };
      let doc = bankDocumentSchema.parse((await call<{ data: unknown }>(documents.POST, "POST", token, { action: "draft", revision: 0, payload }, 1, 201)).data);
      manifest.bankIds.push(...doc.questions.map(q => q.id!)); checkpoint();
      await call(document.PUT, "PUT", token, { action: "publish", revision: doc.revision, payload: doc }, doc.id, 422);
      doc.questions[0].bodyRichText = `<p>${kind === "fill_in_gap" || kind === "passage" ? "[gap]" : "Explain the engineering principle"}<span data-type="inline-math" data-latex="E=mc^2"></span></p>${graphic}`;
      if (doc.questions[0].questionType === "options") doc.questions[0].options = [{ optionText: kind === "true_false" ? "True" : "Correct", isCorrect: true }, { optionText: kind === "true_false" ? "False" : "Incorrect", isCorrect: false }];
      if (doc.questions[0].questionType === "fill_in_gap") doc.questions[0].blanks = [{ acceptedAnswer: " Force " }];
      if (kind === "passage") {
        doc.passages[0].bodyRichText = `<p>Shared text</p>${graphic}`;
        doc.questions.push({ ...newBuilderQuestion("essay", randomUUID(), doc.passages[0].clientKey), bodyRichText: "Discuss the passage" });
      }
      doc = bankDocumentSchema.parse((await call<{ data: unknown }>(document.PUT, "PUT", token, { action: "publish", revision: doc.revision, payload: doc }, doc.id)).data);
      manifest.bankIds.push(...doc.questions.map(q => q.id!).filter(id => !manifest.bankIds.includes(id))); checkpoint();
      check(doc.kind === kind && doc.status === "published" && doc.questions[0].bodyRichText.includes("/object/sign/") && doc.questions[0].bodyRichText.includes("E=mc^2"), "Type, image or equation failed to persist");
      await call(document.PUT, "PUT", token, { action: "draft", revision: 0, payload: doc }, doc.id, 409);
      docs.push(doc);
    }
    console.log("PASS: all five bank types, drafts, strict publish, revision conflicts, LaTeX and private images");
    if (process.argv.includes("--browser")) {
      const browserCheck = (await import(pathToFileURL(join(tmpdir(), "dos-bank-live.cjs")).href)).default as (config: { token: string; user: { id: number; roleId: number; role: string }; documents: BankDocument[] }) => Promise<void>;
      const teacherRole = roleRows.find(role => role.name === "teacher")!;
      try { await browserCheck({ token, user: { id: manifest.userIds[0], roleId: teacherRole.id, role: "teacher" }, documents: docs }); }
      catch (error: unknown) { throw new Failure(error instanceof Error && /^(Timed out|Layout\/focus\/target|Browser command failed|Browser evaluation failed)/.test(error.message) ? error.message : "Browser connection/setup failed"); }
      const edited = bankDocumentSchema.parse((await call<{ data: unknown }>(document.GET, "GET", token, undefined, docs[4].id)).data);
      check(edited.status === "published" && edited.questions[0].bodyRichText.includes("Browser verified essay") && edited.questions[0].bodyRichText.includes("F=ma"), "Browser essay edits or equation did not persist");
      docs[4] = edited;
      console.log("PASS: actual bank chooser/editor, image upload, LaTeX, draft/publish, mobile/desktop and theme verification");
    }
    await call(document.GET, "GET", null, undefined, docs[0].id, 401);
    await call(document.GET, "GET", sessions.get("aspirant")!, undefined, docs[0].id, 403);
    await call(images.DELETE, "DELETE", token, { path: image.path }, 1, 409);
    const created = await call<{ id: number }>(quizApi.POST, "POST", token, { title: prefix, quizType: "course", jambSubjectId: subject.id, weekStart: "2026-11-14" }, 1, 201);
    manifest.quizIds.push(created.id); checkpoint();
    const copiedQuestions: BankDocument["questions"] = []; const copiedPassages: BankDocument["passages"] = [];
    for (const doc of docs) {
      const copied = (await call<{ data: Pick<BankDocument, "questions" | "passages"> }>(copyApi.POST, "POST", token, { questionId: doc.id }, created.id, 201)).data;
      check(copied.questions[0].bodyRichText.includes(`quizzes/${created.id}/`) && !copied.questions[0].id, "Image or question identity was not copied independently");
      copiedQuestions.push(...copied.questions); copiedPassages.push(...copied.passages);
    }
    const builder = quizBuilderDocumentSchema.parse((await call<{ data: unknown }>(builderApi.GET, "GET", token, undefined, created.id)).data);
    await call(builderApi.PUT, "PUT", token, { action: "draft", revision: builder.revision, payload: { ...builder, questions: copiedQuestions, passages: copiedPassages } }, created.id);
    const saved = quizBuilderDocumentSchema.parse((await call<{ data: unknown }>(builderApi.GET, "GET", token, undefined, created.id)).data);
    check(saved.questions.length === 6 && saved.passages.length === 1 && saved.questions.some(q => q.questionType === "essay"), "Quiz reuse did not preserve passage children and essays");
    console.log("PASS: auth protection, reference-aware image deletion, independent image copies and quiz reuse");
  } finally {
    await cleanupBankRun(manifest, manifestPath);
  }
}
// Keep the CLI alive until its verification and cleanup promises settle.
const verificationHeartbeat = setInterval(() => {}, 1000);
main().catch(async (error: unknown) => {
  console.error(error instanceof Failure ? error.message : "Bank verification failed; inspect its temporary recovery manifest if cleanup did not finish.");
  if (!(error instanceof Failure)) console.error("Failure type:", error instanceof Error ? error.name : "unknown", "code:", typeof error === "object" && error !== null && "code" in error ? String(error.code) : "none");
  await getDbClient().end(); process.exitCode = 1;
}).finally(() => clearInterval(verificationHeartbeat));
