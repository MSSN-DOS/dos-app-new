import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { bankDocumentSchema, bankSaveSchema } from "@/lib/validation/question-bank";
import { deleteBankDocument, readBankDocument, saveBankDocument } from "@/lib/db/question-bank";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    return NextResponse.json({ data: bankDocumentSchema.parse(await readBankDocument(quizAuthoringId((await params).id), auth)) });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = await saveBankDocument(auth, bankSaveSchema.parse(await requestJson(request)), quizAuthoringId((await params).id));
    return NextResponse.json({ data: bankDocumentSchema.parse(await readBankDocument(id, auth)) });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    await deleteBankDocument(quizAuthoringId((await params).id), auth);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
