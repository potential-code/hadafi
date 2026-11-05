import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import {
  getMyAchievements,
  getMyAchievementsSummary,
  getMyLeaderboard,
  setMyLeaderboardVisibility,
} from "../controllers/achievements.controller";

/**
 * Badges and the leaderboard, mounted at /api/me. Learners only; each sees
 * her own badges, and others on the leaderboard by first name and initial.
 */
const router: IRouter = Router();

router.get("/achievements", authenticate, requireRole("sme"), getMyAchievements);
router.get("/achievements/summary", authenticate, requireRole("sme"), getMyAchievementsSummary);
router.get("/leaderboard", authenticate, requireRole("sme"), getMyLeaderboard);
router.put(
  "/leaderboard-visibility",
  authenticate,
  requireRole("sme"),
  validate(z.object({ show: z.boolean() }).strict()),
  setMyLeaderboardVisibility,
);

export default router;
