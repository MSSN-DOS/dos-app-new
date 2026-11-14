import { NextResponse } from "next/server";
import { quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { readQuizBuilder, saveQuizBuilder, signBuilderPayload } from "@/lib/db/quiz-builder";
import { quizBuilderSaveSchema } from "@/lib/validation/quiz-builder";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = quizAuthoringId((await params).id);
    const db = getDb(); const { quiz, payload } = await readQuizBuilder(db, id, auth);
    return NextResponse.json({ data: { id, quizType: quiz.quizType, status: quiz.status, revision: quiz.builderRevision ?? 0, weekStart: quiz.weekStart, courseId: quiz.courseId, jambSubjectId: quiz.jambSubjectId, ...await signBuilderPayload(db, id, payload) } });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = quizAuthoringId((await params).id);
    const input = quizBuilderSaveSchema.parse(await requestJson(request));
    await saveQuizBuilder(id, auth, input);
    return NextResponse.json({ data: { revision: input.revision + 1, status: input.action === "publish" ? "published" : "draft" } });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
