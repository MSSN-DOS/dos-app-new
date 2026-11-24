import { NextResponse } from "next/server";
import { errorResponse } from "./response";

export function courseErrorResponse(error: unknown) {
  const wrapped = error as { cause?: { code?: string }; code?: string } | null;
  const code = wrapped?.cause?.code ?? wrapped?.code;
  if (code === "23503") return NextResponse.json({
    error: { code: "VALIDATION_ERROR", message: "The selected academic session, level, department or faculty no longer exists. Refresh and choose it again." },
  }, { status: 422 });
  // Log diagnostic codes without SQL parameters or course content.
  if (code) console.error("[courses] database operation failed", { code });
  return errorResponse(error);
}
