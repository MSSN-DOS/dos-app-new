import { NextResponse } from "next/server";
import { QuizAuthoringError, quizAuthoringErrorResponse, quizAuthoringId, requestJson } from "@/lib/api/quiz-authoring";
import { requireAuth } from "@/lib/auth/guard";
import { removeBuilderImage, uploadBuilderImage } from "@/lib/db/quiz-images";
// Path validation is shared by the persisted cover field; ownership is checked in the DB layer.
import { quizImageRemovalSchema, quizImageUploadSchema } from "@/lib/validation/quiz-images";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = quizAuthoringId((await params).id);
    const form = await request.formData(); const file = form.get("file");
    return NextResponse.json({ data: await uploadBuilderImage(id, auth, quizImageUploadSchema.parse(file)) }, { status: 201 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = quizAuthoringId((await params).id);
    const { path } = quizImageRemovalSchema.parse(await requestJson(request));
    if (!path) throw new QuizAuthoringError(422, "Image path is required");
    await removeBuilderImage(id, auth, path);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
