import { Router, type IRouter } from "express";
import { authenticate } from "../middleware/authenticate";
import { getMyStreak } from "../controllers/me.controller";

/** Routes about the signed-in user, mounted at /api/me. */
const router: IRouter = Router();

router.get("/streak", authenticate, getMyStreak);

export default router;
