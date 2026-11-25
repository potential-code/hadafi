import type { Request, Response, NextFunction } from "express";

import { AppError } from "../utils/app-error";

/**
 * Human mentors (the mentor list, open times and booking) are switched off
 * until real mentors can sign in and set their times. HUMAN_MENTORS_ENABLED=true
 * turns them on; docker-compose passes the same value to the site build, so
 * the pages hide what the API refuses. Read per request so tests can flip it.
 */
export const humanMentorsEnabled = (): boolean => process.env["HUMAN_MENTORS_ENABLED"] === "true";

/** Mentor lists answer with an empty list while human mentors are off. */
export function emptyListWhenHumanMentorsOff(_req: Request, res: Response, next: NextFunction): void {
  if (humanMentorsEnabled()) return next();
  res.json([]);
}

/** Open times and booking are refused while human mentors are off. */
export function requireHumanMentors(_req: Request, _res: Response, next: NextFunction): void {
  if (humanMentorsEnabled()) return next();
  next(new AppError("Mentor sessions aren't available on Hadafi right now.", 403, "HUMAN_MENTORS_OFF"));
}
