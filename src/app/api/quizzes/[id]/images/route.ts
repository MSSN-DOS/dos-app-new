import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { quizAuthoringErrorResponse, quizAuthoringId } from "@/lib/api/quiz-authoring";
import { quizAttemptImageLinks } from "@/lib/db/quiz-student";
import { quizImageLinksSchema } from "@/lib/validation/quiz-images";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["student", "aspirant"]);
    return NextResponse.json({ data: quizImageLinksSchema.parse(await quizAttemptImageLinks(quizAuthoringId((await params).id), auth)) });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
