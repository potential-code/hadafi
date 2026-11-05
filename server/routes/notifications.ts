import { Router, type IRouter } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  getMyNotifications,
  getMyUnreadCount,
  readAllMyNotifications,
  readMyNotification,
} from "../controllers/notifications.controller";

/** The bell (in-app notifications), mounted at /api/me/notifications. Any signed-in role. */
const router: IRouter = Router();

router.get("/", authenticate, getMyNotifications);
router.get("/unread-count", authenticate, getMyUnreadCount);
router.post("/read-all", authenticate, readAllMyNotifications);
router.post("/:id/read", authenticate, readMyNotification);

export default router;
