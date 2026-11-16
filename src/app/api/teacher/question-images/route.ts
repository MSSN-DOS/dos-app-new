import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { bankImageLinksSchema, bankImageRemovalSchema } from "@/lib/validation/question-bank";
import { quizImageUploadSchema } from "@/lib/validation/quiz-images";
import { bankImageLinks, removeBankImage, uploadBankImage } from "@/lib/db/question-bank";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = new URL(request.url).searchParams.get("questionId");
    return NextResponse.json({ data: bankImageLinksSchema.parse(await bankImageLinks(auth, id ? quizAuthoringId(id) : undefined)) });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const file = quizImageUploadSchema.parse((await request.formData()).get("file"));
    return NextResponse.json({ data: await uploadBankImage(auth, file) }, { status: 201 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    await removeBankImage(auth, bankImageRemovalSchema.parse(await requestJson(request)).path);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
