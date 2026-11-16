import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { bankCopyResultSchema, bankCopySchema } from "@/lib/validation/question-bank";
import { copyBankDocumentToQuiz } from "@/lib/db/question-bank-copy";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const data = bankCopySchema.parse(await requestJson(request));
    return NextResponse.json({ data: bankCopyResultSchema.parse(await copyBankDocumentToQuiz(quizAuthoringId((await params).id), data.questionId, auth)) }, { status: 201 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
