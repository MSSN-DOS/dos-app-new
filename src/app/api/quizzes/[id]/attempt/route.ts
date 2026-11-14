import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse } from "@/lib/api/quiz-authoring";
import { getQuizAttempt, submitQuizAttempt } from "@/lib/db/quiz-attempt";
import { saveAttemptSnapshot } from "@/lib/db/quiz-student";
import { quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { submitAttemptSchema } from "@/lib/validation/attempts";
import { NextResponse } from "next/server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const auth = await requireAuth(request, ["student", "aspirant"]); return await getQuizAttempt(request, context, auth); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try { const auth = await requireAuth(request, ["student", "aspirant"]); return await submitQuizAttempt(request, context, auth); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function PUT(request: Request, context: Context) {
  try { const auth = await requireAuth(request, ["student", "aspirant"]); await saveAttemptSnapshot(quizAuthoringId((await context.params).id), auth, submitAttemptSchema.parse(await requestJson(request))); return NextResponse.json({ data: { saved: true } }); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
