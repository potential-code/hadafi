import type { Request, Response, NextFunction } from "express";
import { listNotifications, markAllRead, markRead, unreadCount } from "../services/notifications.service";
import { AppError } from "../utils/app-error";

/**
 * The bell, for every signed-in role. Each handler reads and changes only the
 * caller's own notifications (req.user.userId); an id that isn't theirs is a 404.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/me/notifications: the latest 30 and the unread count. */
export async function getMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await listNotifications(req.user!.userId) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/me/notifications/unread-count */
export async function getMyUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: { unread: await unreadCount(req.user!.userId) } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/me/notifications/:id/read */
export async function readMyNotification(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id) || !(await markRead(req.user!.userId, id))) {
      throw new AppError("Notification not found", 404, "NOT_FOUND");
    }
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/me/notifications/read-all */
export async function readAllMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: { updated: await markAllRead(req.user!.userId) } });
  } catch (err) {
    next(err);
  }
}
