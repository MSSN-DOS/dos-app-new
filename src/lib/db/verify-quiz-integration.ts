/** Opt-in verification against the user-confirmed development database, never Vitest.
 * pnpm exec tsx src/lib/db/verify-quiz-integration.ts --development
 * Uses real exported API handlers, JWT verification, Drizzle and private Storage.
 * Synthetic fixtures are removed by exact IDs; a non-secret recovery manifest is
 * kept in the OS temporary directory until cleanup succeeds. No production use.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, getDbClient } from "@/lib/db";
import { roles, users, jambSubjects, teacherSubjects, quizzes, questions, passages, quizQuestions, quizAttempts, quizImages, bestScores, postUtmeScores, cgpaRecords, courses, topics, studentProfiles, aspirantProfiles } from "@/lib/db/schema";
import { getActiveSemester } from "@/lib/semester";
import { signSession } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { quizBuilderDocumentSchema } from "@/lib/validation/quiz-builder";
import { initialQuizSettings, quizPreferencesSchema } from "@/lib/validation/quiz-settings";
import type { QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";
import type { StudentQuizAttempt, StudentQuizReview } from "@/lib/quizzes/student";
import { removeQuizImageObject } from "@/lib/storage/supabase-storage";
import * as quizApi from "@/app/api/teacher/quizzes/route";
import * as builderApi from "@/app/api/teacher/quizzes/[id]/builder/route";
import * as preferencesApi from "@/app/api/teacher/quiz-preferences/route";
import * as imageApi from "@/app/api/teacher/quizzes/[id]/images/route";
import * as imageLinksApi from "@/app/api/quizzes/[id]/images/route";
import * as attemptApi from "@/app/api/quizzes/[id]/attempt/route";
import * as introApi from "@/app/api/quizzes/[id]/route";
import * as reviewApi from "@/app/api/quizzes/[id]/review/route";
import * as gradingApi from "@/app/api/teacher/quizzes/[id]/grading/route";
import * as releaseApi from "@/app/api/admin/scores/release/route";
import * as historyApi from "@/app/api/me/attempts/route";

class Failure extends Error {}
function check(value: unknown, message: string): asserts value { if (!value) throw new Failure(message); }
type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call<T>(handler: Handler, method: string, token: string | null, id = 1, body?: unknown, expected = 200, search = ""): Promise<T> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
  const request = new Request(`http://localhost/api/quizzes/${id}${search}`, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const response = await handler(request, { params: Promise.resolve({ id: String(id) }) });
  check(response.status === expected, `${method} ${handler.name} quiz ${id}: expected ${expected}, received ${response.status}`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}
const prefix = `SYNTHETIC-QUIZ-${randomUUID().slice(0, 8)}`;
const manifest = { prefix, userIds: [] as number[], quizIds: [] as number[], subjectId: 0, topicId: 0 };
const manifestPath = join(tmpdir(), `${prefix}.json`);
const checkpoint = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest));
let stage = "setup";
function begin(value: string) { stage = value; console.log(`Checking: ${value}`); }
async function main() {
  check(process.argv.includes("--development"), "Pass --development only for a confirmed development database");
  process.loadEnvFile(".env.local");
  const db = getDb();
  try {
    begin("synthetic role accounts");
    const roleRows = await db.select().from(roles);
    const accounts = new Map<string, { id: number; token: string }>();
    const passwordHash = await hashPassword(randomUUID());
    for (const name of ["admin", "teacher", "aspirant", "student"] as const) {
      const role = roleRows.find((r) => r.name === name); check(role, "Seed app roles first");
      const [user] = await db.insert(users).values({ roleId: role.id, fullName: `${prefix} ${name}`, identifier: `${prefix}-${name}`, identifierType: name === "student" ? "matric_number" : name === "aspirant" ? "jamb_reg_number" : "staff_id", passwordHash }).returning();
      manifest.userIds.push(user.id); checkpoint();
      accounts.set(name, { id: user.id, token: await signSession({ userId: user.id, roleId: role.id }) });
    }
    const admin = accounts.get("admin")!, teacher = accounts.get("teacher")!, learner = accounts.get("aspirant")!, student = accounts.get("student")!;
    begin("synthetic academic fixtures");
    const [subject] = await db.insert(jambSubjects).values({ name: prefix }).returning(); manifest.subjectId = subject.id; checkpoint();
    await db.insert(teacherSubjects).values({ userId: teacher.id, jambSubjectId: subject.id });
    // Read Board academic structure only. Do not change an existing course or
    // invent an academic session to work around the dev-only session_id drift.
    const [course] = await db.select({ id: courses.id, levelId: courses.levelId, departmentId: courses.departmentId }).from(courses)
      .where(and(eq(courses.scopeType, "department"), eq(courses.semester, await getActiveSemester(db)))).limit(1);
    check(course?.departmentId, "Development needs an eligible department-scoped course for student verification");
    const [topic] = await db.insert(topics).values({ courseId: course.id, createdBy: teacher.id, title: prefix }).returning(); manifest.topicId = topic.id; checkpoint();
    await db.insert(teacherSubjects).values({ userId: teacher.id, courseId: course.id });
    await db.insert(studentProfiles).values({ userId: student.id, departmentId: course.departmentId, levelId: course.levelId });
    await db.insert(aspirantProfiles).values({ userId: learner.id, aspirationDepartmentId: course.departmentId });
    const read = async (id: number) => quizBuilderDocumentSchema.parse((await call<{ data: unknown }>(builderApi.GET, "GET", teacher.token, id)).data);
    const create = async (topicQuiz = false) => {
      const quiz = await call<{ id: number }>(quizApi.POST, "POST", teacher.token, 1, { title: prefix, quizType: topicQuiz ? "topic" : "course", ...(topicQuiz ? { courseId: course.id, topicId: topic.id } : { jambSubjectId: subject.id, weekStart: "2026-11-14" }) }, 201);
      manifest.quizIds.push(quiz.id); checkpoint(); return quiz.id;
    };
    const testBrowser = async () => {
      begin("real browser editing, equation insertion, answer selection and publishing");
      const bid = await create(true); const bdoc = await read(bid);
      await call(builderApi.PUT, "PUT", teacher.token, bid, { action: "draft", revision: bdoc.revision, payload: { details: { title: prefix }, settings: initialQuizSettings, questions: [{ questionType: "options", bodyRichText: "<p>Question to edit</p>", marks: 4, options: [{ optionText: "True", isCorrect: true }, { optionText: "False", isCorrect: false }] }] } });
      const browserCheck = (await import(pathToFileURL(join(tmpdir(), "dos-quiz-live.cjs")).href)).default as (config: { quizId: number; token: string; user: { id: number; roleId: number; role: string } }) => Promise<void>;
      const role = roleRows.find((r) => r.name === "teacher")!;
      try { await browserCheck({ quizId: bid, token: teacher.token, user: { id: teacher.id, roleId: role.id, role: "teacher" } }); }
      catch (error) { throw new Failure(error instanceof Error ? error.message : "Browser verification failed"); }
      const browserDoc = await read(bid);
      check(browserDoc.status === "published" && browserDoc.details.title === "Browser verified quiz" && browserDoc.questions[0].bodyRichText.includes("E=mc^2") && browserDoc.questions[0].options?.[1].isCorrect, "Browser edits did not persist or publish");
      console.log("PASS: actual browser typing, LaTeX toolbar, answer selection, draft/publish persistence and mobile themes");
    };
    if (process.argv.includes("--browser-only")) { await testBrowser(); return; }
    begin("defaults, draft persistence, strict validation and authorization");
    const settings = { ...initialQuizSettings, shuffleQuestions: true, shuffleOptions: true, allowMultipleAttempts: true, autoNextQuestion: true, showCalculator: true, deductMarksForWrong: true, showAnswersAfter: "after_attempt" as const, scheduleEnabled: true, opensAt: new Date(Date.now() - 60000), closesAt: null };
    await call(preferencesApi.PUT, "PUT", teacher.token, 1, { defaults: settings, pinned: ["showCalculator"] });
    const prefs = quizPreferencesSchema.parse((await call<{ data: unknown }>(preferencesApi.GET, "GET", teacher.token)).data);
    check(prefs.defaults?.showCalculator && prefs.defaults.opensAt === null && prefs.pinned[0] === "showCalculator", "Preferences/default dates did not persist correctly");
    const id = await create(); let doc = await read(id);
    check(doc.settings.showCalculator && doc.details.durationSeconds === null && doc.settings.opensAt === null, "Defaults/untimed creation failed");
    await call(builderApi.GET, "GET", null, id, undefined, 401);
    await call(builderApi.GET, "GET", learner.token, id, undefined, 403);
    let payload: QuizDraftPayloadInput = { details: { ...doc.details, description: "<p>Real persistence</p>", instructions: "<p>Read before starting</p>" }, settings, passages: [], questions: [{ clientKey: "unfinished", questionType: "options", bodyRichText: "", options: [], marks: 0 }] };
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "draft", revision: doc.revision, payload }); doc = await read(id);
    check(doc.questions.length === 1 && doc.questions[0].marks === 0, "Incomplete draft failed to persist");
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "publish", revision: doc.revision, payload }, 422);
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "draft", revision: 0, payload }, 409);
    console.log("PASS: defaults, pins, drafts, strict publish, auth and revision conflicts");

    begin("private Storage, all question types, marks/order and publish");
    const upload = async () => {
      const form = new FormData(); form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKAAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "synthetic.png");
      return (await call<{ data: { path: string; url: string } }>(imageApi.POST, "POST", teacher.token, id, form, 201)).data;
    };
    const image = await upload(), explanationImage = await upload(), unusedCover = await upload();
    const download = await fetch(image.url, { signal: AbortSignal.timeout(30000) }); check(download.ok && (await download.arrayBuffer()).byteLength > 0, "Signed image download failed");
    payload = { ...payload, details: { ...payload.details, coverImagePath: image.path }, passages: [{ clientKey: "passage", title: "Shared text", bodyRichText: "<p>Shared passage</p>" }], questions: [
      { clientKey: "tf", questionType: "options", bodyRichText: "<p>True or false?</p>", options: [{ optionText: "True", isCorrect: true }, { optionText: "False", isCorrect: false }], marks: 4 },
      { clientKey: "mc", questionType: "options", bodyRichText: `<p>Choose an option</p><img src="${image.url}" data-storage-path="${image.path}">`, reasonRichText: `<p>Explanation</p><img src="${explanationImage.url}" data-storage-path="${explanationImage.path}">`, options: [{ optionText: "One", isCorrect: true }, { optionText: "Two", isCorrect: false }, { optionText: "Three", isCorrect: false }], marks: 3 },
      { clientKey: "gap", questionType: "fill_in_gap", bodyRichText: "<p>[gap] and [gap]</p>", blanks: [{ acceptedAnswer: "Force" }, { acceptedAnswer: "Mass" }], marks: 5, passageKey: "passage" },
      { clientKey: "essay", questionType: "essay", bodyRichText: "<p>Explain Newton's law</p>", marks: 8, passageKey: "passage" },
      ...Array.from({ length: 46 }, (_, i) => ({ clientKey: `extra-${i}`, questionType: "options" as const, bodyRichText: `<p>Objective ${i}</p>`, options: [{ optionText: "Yes", isCorrect: true }, { optionText: "No", isCorrect: false }], marks: 1 })),
    ] };
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "draft", revision: doc.revision, payload }); doc = await read(id);
    check(doc.questions.length === 50 && doc.passages.length === 1 && doc.coverImageUrl && doc.questions[1].bodyRichText.includes("/object/sign/"), "Full builder reload failed");
    await call(imageApi.DELETE, "DELETE", teacher.token, id, { path: image.path }, 409);
    payload = { ...doc, questions: [...doc.questions.slice(4), ...doc.questions.slice(0, 4)] };
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "draft", revision: doc.revision, payload }); doc = await read(id);
    check(doc.questions[0].bodyRichText.includes("Objective 0") && doc.questions[48].passageKey === doc.questions[49].passageKey, "Reorder/passage persistence failed");
    await call(builderApi.PUT, "PUT", teacher.token, id, { action: "publish", revision: doc.revision, payload: doc });
    await call(imageApi.DELETE, "DELETE", teacher.token, id, { path: unusedCover.path }, 204);
    console.log("PASS: Storage upload/download, stable paths, five types, marks/order, publish and unused cover deletion");

    begin("start, progress, resume, shuffling and image renewal");
    await call(introApi.GET, "GET", learner.token, id);
    check((await db.select().from(quizAttempts).where(eq(quizAttempts.quizId, id))).length === 0, "Introduction created an attempt");
    const attempt = (await call<{ data: StudentQuizAttempt }>(attemptApi.GET, "GET", learner.token, id)).data;
    check(attempt.durationSeconds === null && attempt.showCalculator && attempt.autoNextQuestion && attempt.questions.length === 50, "Runtime settings failed");
    check(!JSON.stringify(attempt).match(/isCorrect|acceptedAnswer/), "Attempt leaked an answer key");
    const links = (await call<{ data: { path: string }[] }>(imageLinksApi.GET, "GET", learner.token, id)).data;
    check(links.some((l) => l.path === image.path) && !links.some((l) => l.path === explanationImage.path), "Image renewal leaked an explanation or lost a visible image");
    const tf = attempt.questions.find((q) => q.bodyRichText.includes("True or false"))!, mc = attempt.questions.find((q) => q.bodyRichText.includes("Choose an option"))!, gap = attempt.questions.find((q) => q.questionType === "fill_in_gap")!, essay = attempt.questions.find((q) => q.questionType === "essay")!;
    const answers = [{ questionId: tf.id, selectedOptionId: tf.options.find((o) => o.optionText.includes("True"))!.id }, { questionId: mc.id, selectedOptionId: mc.options.find((o) => o.optionText.includes("Two"))!.id }, { questionId: gap.id, blankAnswers: { "1": " FORCE ", "2": " mass " } }, { questionId: essay.id, essayAnswer: "Synthetic explanation" }];
    await call(attemptApi.PUT, "PUT", learner.token, id, { answers });
    const resumed = (await call<{ data: StudentQuizAttempt }>(attemptApi.GET, "GET", learner.token, id)).data;
    const order = (data: StudentQuizAttempt) => data.questions.map((q) => [q.id, q.options.map((o) => o.id)]);
    check(resumed.attemptId === attempt.attemptId && resumed.startedAt === attempt.startedAt && resumed.savedAnswers.length === 4 && JSON.stringify(order(resumed)) === JSON.stringify(order(attempt)), "Resume lost time, answers or shuffled order");
    const submitted = (await call<{ data: Record<string, unknown> }>(attemptApi.POST, "POST", learner.token, id, { answers }, 201)).data;
    check(submitted.scoreStatus === "awaiting_grading" && !("score" in submitted), "Submission leaked an essay score");
    console.log("PASS: real start/progress/resume/shuffling, safe image renewal and held submission");

    begin("manual grading, Admin release, weighted results and aggregates");
    const review = async () => (await call<{ data: StudentQuizReview }>(reviewApi.GET, "GET", learner.token, id, undefined, 200, `?attemptId=${attempt.attemptId}`)).data;
    check((await review()).status === "awaiting_grading", "Review grading status failed");
    await call(releaseApi.POST, "POST", admin.token, 1, { quizId: id }, 409);
    const pending = (await call<{ data: { id: number; essays: { answer: string }[] }[] }>(gradingApi.GET, "GET", teacher.token, id)).data;
    check(pending[0]?.id === attempt.attemptId && pending[0].essays[0].answer === "Synthetic explanation", "Teacher cannot read the essay response");
    await call(gradingApi.PATCH, "PATCH", teacher.token, id, { attemptId: attempt.attemptId, answers: [{ questionId: essay.id, awardedMarks: 9 }] }, 422);
    await call(gradingApi.PATCH, "PATCH", teacher.token, id, { attemptId: attempt.attemptId, answers: [{ questionId: essay.id, awardedMarks: 6 }] });
    const [graded] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, attempt.attemptId));
    check(Number(graded.score) === 18.18 && !graded.releasedAt, "Expected held (4-3+5+6)/66 = 18.18%");
    check((await review()).status === "held" && !((await review()).score), "Held review leaked score");
    await call(releaseApi.POST, "POST", admin.token, 1, { quizId: id });
    const released = await review(); check(released.status === "released" && released.score === 18.18 && released.passed === false, "Admin release result failed");
    const [aggregate] = await db.select().from(postUtmeScores).where(and(eq(postUtmeScores.userId, learner.id), eq(postUtmeScores.weekStart, "2026-11-14")));
    check(Number(aggregate?.rawScore) === 18.18, "Course result did not recompute Post-UTME");
    console.log("PASS: real essays, weighted deduction/gaps, manual grading, Admin release and Post-UTME");

    if (process.argv.includes("--browser")) {
      await testBrowser();
    }
    begin("student scope, seconds/math, expiry, hidden results and Topic exclusion");
    const sid = await create(true); const sdoc = await read(sid);
    await call(builderApi.PUT, "PUT", teacher.token, sid, { action: "publish", revision: sdoc.revision, payload: { details: { title: prefix, durationSeconds: 90 }, settings: { ...initialQuizSettings, showResultAfter: "never", showAnswersAfter: "never" }, questions: [{ questionType: "options", bodyRichText: '<p>Energy <span data-type="inline-math" data-latex="E=mc^2"></span></p>', marks: 7, options: [{ optionText: "Correct", isCorrect: true }, { optionText: "Wrong", isCorrect: false }] }] } });
    await call(introApi.GET, "GET", learner.token, sid, undefined, 403);
    const sa = (await call<{ data: StudentQuizAttempt }>(attemptApi.GET, "GET", student.token, sid)).data;
    check(sa.durationSeconds === 90 && sa.questions[0].bodyRichText.includes("E=mc^2"), "Student scope, seconds or math failed");
    await call(attemptApi.PUT, "PUT", student.token, sid, { answers: [{ questionId: sa.questions[0].id, selectedOptionId: sa.questions[0].options.find((o) => o.optionText.includes("Correct"))!.id }] });
    await db.update(quizAttempts).set({ startedAt: new Date(Date.now() - 91000) }).where(eq(quizAttempts.id, sa.attemptId));
    await call(attemptApi.GET, "GET", student.token, sid, undefined, 409);
    const [expired] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, sa.attemptId));
    check(expired.submittedAt && Number(expired.score) === 100 && !expired.releasedAt, "Expiry did not grade saved progress and hold the score");
    await call(releaseApi.POST, "POST", admin.token, 1, { quizId: sid });
    const hidden = (await call<{ data: StudentQuizReview }>(reviewApi.GET, "GET", student.token, sid, undefined, 200, `?attemptId=${sa.attemptId}`)).data;
    check(hidden.status === "hidden" && !("score" in hidden) && hidden.questions.length === 0, "Hidden result leaked");
    check((await db.select().from(cgpaRecords).where(eq(cgpaRecords.userId, student.id))).length === 0, "Topic Quiz fed CGPA");
    const history = await call<{ data: { quizId: number; score?: number; scoreStatus?: string }[] }>(historyApi.GET, "GET", student.token);
    check(history.data.some((a) => a.quizId === sid && a.scoreStatus === "hidden" && a.score === undefined), "History leaked a hidden result");
    console.log("PASS: student academic scope, seconds/math, saved expiry, single attempts, hidden history and Topic exclusion");
  } finally {
    const { userIds, quizIds } = manifest;
    if (quizIds.length) {
      const images = await db.select().from(quizImages).where(inArray(quizImages.quizId, quizIds));
      for (const image of images) await removeQuizImageObject(image.objectPath);
      await db.transaction(async (tx) => {
        await tx.delete(bestScores).where(inArray(bestScores.quizId, quizIds));
        await tx.delete(quizAttempts).where(inArray(quizAttempts.quizId, quizIds));
        await tx.delete(quizQuestions).where(inArray(quizQuestions.quizId, quizIds));
        await tx.delete(questions).where(inArray(questions.builderQuizId, quizIds));
        await tx.delete(passages).where(inArray(passages.builderQuizId, quizIds));
        await tx.delete(quizzes).where(inArray(quizzes.id, quizIds));
      });
    }
    if (manifest.topicId) await db.delete(topics).where(eq(topics.id, manifest.topicId));
    if (userIds.length) {
      await db.delete(postUtmeScores).where(inArray(postUtmeScores.userId, userIds));
      await db.delete(cgpaRecords).where(inArray(cgpaRecords.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    if (manifest.subjectId) await db.delete(jambSubjects).where(eq(jambSubjects.id, manifest.subjectId));
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    console.log("Cleaned this run's synthetic records and Storage objects.");
    await getDbClient().end();
  }
}
main().catch(async (error: unknown) => {
  const codes: string[] = []; let cause = error;
  for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
    if ("name" in cause && typeof cause.name === "string") codes.push(cause.name);
    if ("code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]+$/.test(cause.code)) codes.push(cause.code);
    for (const field of ["table_name", "column_name"]) {
      if (field in cause) { const value = (cause as Record<string, unknown>)[field]; if (typeof value === "string" && /^[a-z_]+$/.test(value)) codes.push(`${field}=${value}`); }
    }
    cause = "cause" in cause ? cause.cause : null;
  }
  console.error(`FAIL during ${stage}: ${error instanceof Failure ? error.message : codes.join(" / ") || "operation failed"}`);
  await getDbClient().end(); process.exitCode = 1;
});
