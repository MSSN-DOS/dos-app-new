import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse, requestJson } from "@/lib/api/quiz-authoring";
import { bankDocumentSchema, bankSaveSchema } from "@/lib/validation/question-bank";
import { readBankDocument, saveBankDocument } from "@/lib/db/question-bank";
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = await saveBankDocument(auth, bankSaveSchema.parse(await requestJson(request)));
    return NextResponse.json({ data: bankDocumentSchema.parse(await readBankDocument(id, auth)) }, { status: 201 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
