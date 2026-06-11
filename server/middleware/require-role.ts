import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/app-error";

/**
 * Middleware factory that restricts a route to users with one of the specified roles.
 *
 * Must be applied *after* the `authenticate` middleware, which populates `req.user`.
 * If `req.user` is absent or the user's role is not in the allowed list, a 403
 * AppError is forwarded to the global error handler.
 *
 * @param roles - One or more role strings that are permitted to access the route.
 * @returns Express middleware function.
 *
 * @example
 * router.post("/invites", authenticate, requireRole("admin"), createInvite);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403, "FORBIDDEN"));
    }
    next();
  };
}
