import type { Request, Response, NextFunction } from "express";
import {
  achievementsSummary,
  getLeaderboard,
  listBadges,
  pointsEarned,
  setLeaderboardVisibility,
  type LeaderboardPeriod,
} from "../services/achievements.service";

/** GET /api/me/achievements: points (balance and earned) and the learner's own badges with progress. */
export async function getMyAchievements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const [points, badges] = await Promise.all([pointsEarned(userId), listBadges(userId)]);
    res.json({ data: { ...points, badges } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/me/achievements/summary: badge count, next badge and this month's rank, for the home card. */
export async function getMyAchievementsSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await achievementsSummary(req.user!.userId) });
  } catch (err) {
    next(err);
  }
}

const PERIODS: LeaderboardPeriod[] = ["week", "month", "all"];

/** GET /api/me/leaderboard?period=week|month|all: top learners by points earned, and the viewer's place. */
export async function getMyLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asked = req.query["period"] as LeaderboardPeriod;
    const period = PERIODS.includes(asked) ? asked : "month";
    res.json({ data: await getLeaderboard(req.user!.userId, period) });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/me/leaderboard-visibility { show } */
export async function setMyLeaderboardVisibility(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { show } = req.body as { show: boolean };
    await setLeaderboardVisibility(req.user!.userId, show);
    res.json({ data: { show } });
  } catch (err) {
    next(err);
  }
}
