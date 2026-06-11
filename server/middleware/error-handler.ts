import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/app-error";
import { logger } from "../config/logger";

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in `server/index.ts` so it catches errors from all
 * other middleware and route handlers.
 *
 * - `AppError` instances are converted to structured JSON responses.
 * - Unknown errors are logged and returned as 500 without leaking internals.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // `next` must be declared even if unused — Express uses arity-4 to identify
  // error-handling middleware.
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code },
    });
    return;
  }

  // Unexpected error — log the full details server-side but never expose them.
  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  });
}
