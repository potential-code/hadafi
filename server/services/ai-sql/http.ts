import type { NextFunction, Request, Response } from "express";
import { AiSqlError } from "./guard";

/**
 * Guard rejections and Postgres errors carry the full list of reasons in
 * `error.errors`: the agent's correction signal. Everything else falls
 * through to the global handler.
 */
export function aiSqlErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AiSqlError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, errors: err.errors },
    });
    return;
  }
  next(err);
}
