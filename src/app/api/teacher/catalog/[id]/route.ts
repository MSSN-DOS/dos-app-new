import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/api/response";
import { catalogDetails } from "@/lib/db/catalog-details";

const querySchema = z.object({
  id: z.coerce.number().int().positive(),
  kind: z.enum(["course", "topic"]),
  topicPage: z.coerce.number().int().positive().default(1),
  quizPage: z.coerce.number().int().positive().default(1),
});
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request, ["admin", "teacher"]);
    const search = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      ...Object.fromEntries(search),
      id: (await context.params).id,
    });
    if (!parsed.success)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid parameters",
            details: parsed.error.issues,
          },
        },
        { status: 422 },
      );
    const { id, kind, topicPage, quizPage } = parsed.data;
    const data = await catalogDetails(auth, id, kind, topicPage, quizPage);
    return data
      ? NextResponse.json({ data })
      : NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Not found" } },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error);
  }
}
