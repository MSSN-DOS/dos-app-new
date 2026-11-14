import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse } from "./response";

export class QuizAuthoringError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: { field: string; message: string }[]) { super(message); }
}
export function quizAuthoringErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Review the highlighted fields", details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) } }, { status: 422 });
  if (error instanceof QuizAuthoringError) return NextResponse.json({ error: { code: error.status === 422 ? "VALIDATION_ERROR" : error.status === 409 ? "CONFLICT" : "REQUEST_ERROR", message: error.message, ...(error.details ? { details: error.details } : {}) } }, { status: error.status });
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists. Reload and try again." } }, { status: 409 });
  return errorResponse(error);
}
export function quizAuthoringId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new QuizAuthoringError(400, "Invalid quiz id");
  return id;
}
export async function requestJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}
