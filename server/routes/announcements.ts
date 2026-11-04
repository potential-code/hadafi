import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, HOUR, MINUTE } from "../middleware/limits";
import { AppError } from "../utils/app-error";
import * as svc from "../services/announcements.service";

/**
 * Announcements (ported from SMEEP):
 * - /api/admin/announcements: admins write, schedule, end and review them;
 * - /api/me/announcements: the banners for the signed-in learner or mentor,
 *   and her announcement-email setting;
 * - /api/announcements/unsubscribe: the one-click link in an email (no sign-in).
 */
export const adminAnnouncementsRouter: IRouter = Router();
export const myAnnouncementsRouter: IRouter = Router();
export const publicAnnouncementsRouter: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const testing = process.env["NODE_ENV"] === "test";

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

const idParam = (req: Request): string => {
  const id = String(req.params["id"] ?? "");
  if (!UUID_RE.test(id)) throw new AppError("Announcement not found", 404, "NOT_FOUND");
  return id;
};

// An in-app path, or an https:// link (never javascript: and friends).
const linkUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/(?!\/)[\w\-/?=&#.%]*$/.test(v) || /^https:\/\/[^\s<>"]+$/i.test(v), "Use a page path like /dashboard/courses, or an https:// link");

const announcementDto = z.object({
  title: z.string().trim().min(3).max(60),
  body: z.string().trim().min(3).max(280),
  linkUrl: z.union([linkUrl, z.literal("")]).nullable().optional(),
  linkLabel: z.string().trim().max(40).nullable().optional(),
  audience: z.string().regex(/^[a-z0-9_-]{2,40}$/),
  audienceRef: z.string().trim().max(100).nullable().optional(),
  showBanner: z.boolean(),
  notify: z.boolean(),
  email: z.boolean().default(false),
  mode: z.enum(["now", "schedule", "draft"]),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

// ── Admin ───────────────────────────────────────────────────────────────────

adminAnnouncementsRouter.use(authenticate, requireRole("admin"));
// Each send can reach every learner: a cap stops a stolen session from spamming them.
const sendLimit = perUser("admin-announcements", HOUR, testing ? 10_000 : 30, "That is a lot of announcements in one hour. Please try again later.");

adminAnnouncementsRouter.get("/", wrap(() => svc.listAnnouncements()));

// GET /api/admin/announcements/audience?audience=learners&ref= : how many it would reach
adminAnnouncementsRouter.get(
  "/audience",
  wrap(async (req) => ({
    ...(await svc.countAudience(String(req.query["audience"] ?? "learners"), req.query["ref"] ? String(req.query["ref"]) : null)),
    emailEnabled: svc.announcementEmailsEnabled(),
  })),
);

adminAnnouncementsRouter.post(
  "/",
  sendLimit,
  validate(announcementDto),
  wrap(async (req, res) => {
    res.status(201);
    return svc.createAnnouncement(req.user!.userId, req.body as svc.AnnouncementInput);
  }),
);

adminAnnouncementsRouter.put(
  "/:id",
  sendLimit,
  validate(announcementDto),
  wrap((req) => svc.updateAnnouncement(idParam(req), req.body as svc.AnnouncementInput)),
);

adminAnnouncementsRouter.delete(
  "/:id",
  wrap(async (req) => {
    if (!(await svc.deleteAnnouncement(idParam(req)))) throw new AppError("Only a draft or a scheduled announcement can be deleted.", 404, "NOT_FOUND");
    return { ok: true };
  }),
);

// POST /api/admin/announcements/:id/end : take the banner down now
adminAnnouncementsRouter.post(
  "/:id/end",
  wrap(async (req) => {
    if (!(await svc.endAnnouncement(idParam(req)))) throw new AppError("That announcement isn't live.", 404, "NOT_FOUND");
    return { ok: true };
  }),
);

// ── The signed-in user ──────────────────────────────────────────────────────

myAnnouncementsRouter.get("/", authenticate, wrap((req) => svc.activeBanners(req.user!.userId, req.user!.role)));

myAnnouncementsRouter.get(
  "/email-preference",
  authenticate,
  wrap(async (req) => ({ announcements: await svc.getAnnouncementEmails(req.user!.userId), emailEnabled: svc.announcementEmailsEnabled() })),
);

myAnnouncementsRouter.put(
  "/email-preference",
  authenticate,
  validate(z.object({ announcements: z.boolean() })),
  wrap(async (req) => {
    const on = (req.body as { announcements: boolean }).announcements;
    await svc.setAnnouncementEmails(req.user!.userId, on);
    return { announcements: on };
  }),
);

// ── One click from an email, no sign-in ─────────────────────────────────────

const unsubscribeLimit = perUser("announcement-unsubscribe", 15 * MINUTE, testing ? 10_000 : 30);

publicAnnouncementsRouter.post(
  "/unsubscribe",
  unsubscribeLimit,
  validate(z.object({ token: z.string().min(10).max(300) })),
  wrap(async (req) => {
    const userId = svc.verifyUnsubscribeToken((req.body as { token: string }).token);
    if (!userId || !(await svc.setAnnouncementEmails(userId, false))) {
      throw new AppError("This unsubscribe link isn't valid.", 400, "INVALID_TOKEN");
    }
    return { unsubscribed: true };
  }),
);
