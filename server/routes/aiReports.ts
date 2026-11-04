import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, DAY, HOUR } from "../middleware/limits";
import { AppError } from "../utils/app-error";
import * as svc from "../services/aiReports.service";

/**
 * AI safety review: learners report an answer from their own AI chats
 * (POST /api/ai-reports); admins review the reports (/api/admin/ai-reports).
 */
export const aiReportsRouter: IRouter = Router();
export const adminAiReportsRouter: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const testing = process.env["NODE_ENV"] === "test";
const THANKS = "You've sent a lot of reports. Thank you; please try again a little later.";
// Tests check the hourly cap on its own fixture user, so it stays real in tests.
const reportsPerHour = perUser("ai-reports-hour", HOUR, 10, THANKS);
const reportsPerDay = perUser("ai-reports-day", DAY, testing ? 10_000 : 30, THANKS);

const turn = z.object({ role: z.enum(["learner", "ai"]), text: z.string().max(8_000) });
const reportDto = z.object({
  surface: z.string().trim().min(2).max(80).regex(/^[a-z0-9:-]+$/),
  reason: z.enum(svc.REPORT_REASONS),
  note: z.string().trim().max(1000).optional().nullable(),
  reply: z.string().trim().min(1).max(20_000),
  question: z.string().max(8_000).optional().nullable(),
  excerpt: z.array(turn).max(12).optional().nullable(),
  conversation: z.string().regex(/^[\w-]{1,120}$/).optional().nullable(),
  page: z.string().max(300).regex(/^\//).optional().nullable(),
});

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
  if (!UUID_RE.test(id)) throw new AppError("Report not found", 404, "NOT_FOUND");
  return id;
};

// Learners only: the AI chats it covers are the learner app's. The reporter is
// always the session's user; nothing in the body can name another learner.
aiReportsRouter.post(
  "/",
  authenticate,
  requireRole("sme"),
  reportsPerHour,
  reportsPerDay,
  validate(reportDto),
  wrap(async (req, res) => {
    const result = await svc.createReport(req.user!.userId, req.body as svc.NewReport);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }),
);

adminAiReportsRouter.use(authenticate, requireRole("admin"));

// GET /api/admin/ai-reports?status=new|reviewed|action_taken|all&area=hana|mentor|examiner|all
adminAiReportsRouter.get(
  "/",
  wrap(async (req) => {
    const s = String(req.query["status"] ?? "all");
    const a = String(req.query["area"] ?? "all");
    return svc.listReports({
      status: (svc.REPORT_STATUSES as readonly string[]).includes(s) ? (s as svc.ReportStatus) : "all",
      area: ["hana", "mentor", "examiner"].includes(a) ? (a as svc.SurfaceArea) : "all",
    });
  }),
);

adminAiReportsRouter.patch(
  "/:id",
  validate(z.object({ status: z.enum(svc.REPORT_STATUSES) })),
  wrap((req) => svc.setReportStatus(req.user!.userId, idParam(req), (req.body as { status: svc.ReportStatus }).status)),
);

adminAiReportsRouter.post(
  "/:id/notes",
  validate(z.object({ text: z.string().trim().min(1).max(2000) })),
  wrap(async (req, res) => {
    res.status(201);
    return svc.addReportNote(req.user!.userId, idParam(req), (req.body as { text: string }).text);
  }),
);
