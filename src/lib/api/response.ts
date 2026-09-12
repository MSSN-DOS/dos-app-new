import { NextResponse } from "next/server";

import { ForbiddenError, UnauthorizedError } from "../auth/errors";

// Shared error handler for /api route handlers. Call inside a try/catch and return its result.
// Maps our typed auth errors to the API error envelope (UPPER_SNAKE_CASE code + safe message),
// and anything else to a generic 500 with no internals leaked.
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: err.message } },
      { status: 401 },
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: err.message } }, { status: 403 });
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  );
}
