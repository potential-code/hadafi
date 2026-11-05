import type { Request, Response, NextFunction } from "express";
import { getStreak } from "../services/streak.service";

/**
 * GET /api/me/streak
 *
 * The authenticated learner's streak and daily goal: current and longest
 * streak, steps completed today, the daily goal and this week (Monday to
 * Sunday in the learner's timezone).
 */
export async function getMyStreak(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await getStreak(req.user!.userId) });
  } catch (err) {
    next(err);
  }
}
