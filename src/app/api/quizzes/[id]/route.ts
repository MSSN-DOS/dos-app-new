import { NextResponse } from "next/server";
import { quizAuthoringErrorResponse, quizAuthoringId } from "@/lib/api/quiz-authoring";
import { requireAuth } from "@/lib/auth/guard";
import { quizIntroduction } from "@/lib/db/quiz-student";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const auth = await requireAuth(request, ["student", "aspirant"]); return NextResponse.json({ data: await quizIntroduction(quizAuthoringId((await params).id), auth) }); }
  catch (error) { return quizAuthoringErrorResponse(error); }
}
