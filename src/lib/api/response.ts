import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ForbiddenError, UnauthorizedError } from "../auth/errors";

/**
 * Shared error handler for `/api` route handlers. Call inside a try/catch and return its result.
 *
 * Maps our typed auth errors to the API error envelope (UPPER_SNAKE_CASE code + safe message),
 * a `ZodError` to 422 with per-issue `details`, and anything else to a generic 500 with no
 * internals leaked.
 *
 * WHY `ZodError` LIVES HERE RATHER THAN IN A PER-ROUTE `validationError`
 * ----------------------------------------------------------------------
 * Thirty-three route files each carried their own byte-identical `validationError(err: ZodError)`
 * copy. That is the shape a missing branch produces: once a mapping is correct and boring,
 * every new handler re-derives it by copy-paste instead of calling the thing that already knows.
 * Putting the branch here means a route's catch block is one line — `return errorResponse(err)` —
 * and there is exactly one place to change if the 422 envelope ever moves.
 *
 * `rootField` is the `field` reported for an issue with an empty path (a whole-body or
 * whole-query failure, e.g. `z.object({...}).strict()` on unexpected keys). It defaults to
 * `"body"`; routes that parse a query string pass `"query"` so the client knows which input
 * was at fault.
 */
export function errorResponse(err: unknown, rootField: string = "body"): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: err.message } },
      { status: 401 },
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: err.message } },
      { status: 403 },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: err.issues.map((issue) => ({
            field: issue.path.join(".") || rootField,
            code: issue.code,
            message: issue.message,
          })),
        },
      },
      { status: 422 },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  );
}
