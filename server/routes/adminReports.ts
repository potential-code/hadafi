import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, HOUR } from "../middleware/limits";
import * as reports from "../controllers/admin.reports.controller";

/**
 * Admin reports, mounted at /api/admin next to the main admin router:
 * the impact dashboard, Analytics highlights, learning gain, spreadsheet
 * exports and "Write with AI" for pre-tests and final exams. Admins only.
 */
const router: IRouter = Router();

router.use(authenticate, requireRole("admin"));

// Exports read every learner's records: a cap keeps a stolen session from scraping in a loop.
const exportLimit = perUser("admin-exports", HOUR, 120, "That is a lot of exports in one hour. Please try again later.");
// Each draft is a paid model call on potential-ai.
const adminAiLimit = perUser("admin-ai", HOUR, 30, "You have written a lot of questions this hour. Please try again later.");

const generateQuizDto = z.object({
  assessmentId: z.string().uuid(),
  count: z.number().int().min(1).max(10).default(5),
  format: z.enum(["multiple-choice", "true-false", "mixed"]).default("multiple-choice"),
});

// GET /api/admin/analytics/impact: impact KPIs, monthly outcomes, what learners use, countries
router.get("/analytics/impact", reports.getImpact);

// GET /api/admin/analytics/insights?range=7d|30d|12m: KPIs vs the previous period, and charts
router.get("/analytics/insights", reports.getInsights);

// GET /api/admin/analytics/learning-gain: first pre-test vs best final exam, overall and per course
router.get("/analytics/learning-gain", reports.getLearningGain);

// GET /api/admin/exports/:dataset?format=csv|xlsx: learners, course progress, learning gain,
// certificates, offer redemptions, mentor sessions
router.get("/exports/:dataset", exportLimit, reports.downloadExport);

// POST /api/admin/quiz/generate: AI drafts from the course's own text (the admin adds the ones they keep)
router.post("/quiz/generate", adminAiLimit, validate(generateQuizDto), reports.generateQuiz);

export default router;
