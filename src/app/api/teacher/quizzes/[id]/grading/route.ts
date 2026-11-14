import { NextResponse } from "next/server";
import { quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { requireAuth } from "@/lib/auth/guard";
import { gradeQuizEssays, listPendingQuizEssays } from "@/lib/db/quiz-grading";
import { manualQuizGradeSchema } from "@/lib/validation/quiz-builder";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const auth = await requireAuth(request, ["admin", "teacher"]); return NextResponse.json({ data: await listPendingQuizEssays(quizAuthoringId((await params).id), auth) }); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const auth = await requireAuth(request, ["admin", "teacher"]); await gradeQuizEssays(quizAuthoringId((await params).id), auth, manualQuizGradeSchema.parse(await requestJson(request))); return NextResponse.json({ data: { scoreStatus: "held" } }); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
