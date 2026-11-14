import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { readQuizPreferences, writeQuizPreferences } from "@/lib/db/quiz-preferences";
import { quizPreferencesSchema } from "@/lib/validation/quiz-settings";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    return NextResponse.json({ data: await readQuizPreferences(auth.userId) });
  } catch (err) {
    return errorResponse(err);
  }
}
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const body: unknown = await request.json();
    const parsed = quizPreferencesSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid quiz preferences",
            details: parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
        },
        { status: 422 },
      );
    return NextResponse.json({
      data: await writeQuizPreferences(auth.userId, parsed.data),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
