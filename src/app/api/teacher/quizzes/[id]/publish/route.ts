import { NextResponse } from "next/server";
import { quizAuthoringErrorResponse, quizAuthoringId } from "@/lib/api/quiz-authoring";
import { requireAuth } from "@/lib/auth/guard";
import { publishStoredQuiz } from "@/lib/db/quiz-builder";

/** Legacy publish clients use the same complete publish gate as the new builder. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const id = quizAuthoringId((await params).id);
    await publishStoredQuiz(id, auth);
    return NextResponse.json({ id, status: "published" });
  } catch (error) { return quizAuthoringErrorResponse(error); }
}
