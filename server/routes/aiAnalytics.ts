import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, MINUTE } from "../middleware/limits";
import * as ai from "../controllers/aiAnalytics.controller";
import { aiSqlErrorHandler } from "../services/ai-sql/http";
import { MAX_SQL_LENGTH } from "../services/ai-sql/limits";
import { reportSpecSchema } from "../services/ai-sql/report-spec";

/**
 * AI analytics: AI Insights (chat + reports) and the AI Dashboard (saved
 * boards), mounted at /api/admin/ai. Ported from SMEEP.
 *
 * Admin only: the `ai` views hold no personal data but aren't scoped per
 * admin, so anyone who can call /query can read the whole schema. The agents
 * run in potential-ai (graphs `dataChat` and `dashboardBuilder`, platformId
 * "hadafi"); they only ever see the catalogue, and every statement they write
 * is guarded and run here, as the read-only role.
 */
const router: IRouter = Router();

// 120 per 5 minutes per admin covers a board of two dozen charts re-rendering several times.
const aiLimit = perUser("admin-ai-analytics", 5 * MINUTE, 120, "Too many analytics requests. Wait a moment and try again.");

router.use(authenticate, requireRole("admin"), aiLimit);

const querySchema = z.object({
  sql: z.string().trim().min(1, "sql is required").max(MAX_SQL_LENGTH),
});

/** GET /api/admin/ai/catalog: the sql-1.2.0 catalogue (no data values). */
router.get("/catalog", ai.getAiCatalog);

/** POST /api/admin/ai/query: guard and run one generated SELECT. */
router.post("/query", validate(querySchema), ai.runAiQuery);

/** POST /api/admin/ai/report: PDF or XLSX of re-run figures. */
router.post("/report", validate(reportSpecSchema), ai.downloadAiReport);

/** Saved AI Dashboard boards (shared by all admins). */
router.get("/dashboards", ai.listAiDashboards);
router.post("/dashboards", validate(ai.dashboardBodySchema), ai.createAiDashboard);
router.get("/dashboards/:id", ai.getAiDashboard);
router.put("/dashboards/:id", validate(ai.dashboardBodySchema), ai.updateAiDashboard);
router.delete("/dashboards/:id", ai.deleteAiDashboard);

router.use(aiSqlErrorHandler);

export default router;
