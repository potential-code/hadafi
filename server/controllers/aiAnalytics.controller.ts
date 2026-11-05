import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/app-error";
import { getCatalog, runQuery } from "../services/ai-sql/analytics.service";
import { buildReport } from "../services/ai-sql/report.service";
import * as dashboards from "../services/ai-sql/dashboards.service";
import { AiSqlError } from "../services/ai-sql/guard";
import { chartSpecIssues, sqlChartSpecSchema, type SqlChartSpec } from "../services/ai-sql/chart-spec";
import { REPORT_FORMATS, type ReportFormat, type ReportSpec } from "../services/ai-sql/report-spec";

/**
 * AI analytics (AI Insights + AI Dashboard): admin-only handlers (ported from SMEEP).
 *
 * Error messages on the query routes are written for a language model as much
 * as for a human: a rejected statement's reasons are what the agent corrects
 * itself from, so they are returned verbatim (`error.errors`), never flattened.
 */

/** GET /api/admin/ai/catalog */
export async function getAiCatalog(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getCatalog() });
}

/** POST /api/admin/ai/query { sql } */
export async function runAiQuery(req: Request, res: Response): Promise<void> {
  const { sql } = req.body as { sql: string };
  res.json({ success: true, data: await runQuery(sql) });
}

/**
 * POST /api/admin/ai/report — a report of the conversation's figures, as a
 * download. The body says what to ask; every figure is re-run on the way
 * through, never taken from the body. Format from the body, else `?format=`,
 * else PDF.
 */
export async function downloadAiReport(req: Request, res: Response): Promise<void> {
  const spec = req.body as ReportSpec;
  const queryFormat = typeof req.query["format"] === "string" ? req.query["format"] : undefined;
  const requested = spec.format ?? queryFormat ?? "pdf";
  if (!(REPORT_FORMATS as readonly string[]).includes(requested)) {
    throw new AppError('format must be "pdf" or "xlsx".', 422, "VALIDATION_ERROR");
  }
  const { buffer, fileName, contentType } = await buildReport(spec, requested as ReportFormat);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
}

/* ------------------------------------------------------------------ */
/* Saved dashboards                                                    */
/* ------------------------------------------------------------------ */

export const MAX_CHARTS_PER_DASHBOARD = 24;

/** Body of POST and PUT /dashboards: a whole board (PUT replaces it). */
export const dashboardBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  charts: z.array(z.unknown()).max(MAX_CHARTS_PER_DASHBOARD).default([]),
});

/**
 * Validates every chart in a board. Fails closed and names the chart index
 * that broke, so a 20-chart save does not come back with a bare "invalid".
 * The SQL is not run here: it is guarded on every execution.
 */
function validateCharts(charts: unknown[]): SqlChartSpec[] {
  return charts.map((chart, i) => {
    const parsed = sqlChartSpecSchema.safeParse(chart);
    if (!parsed.success) {
      const issues = chartSpecIssues(parsed.error);
      throw new AiSqlError(`charts[${i}] is not a valid chart spec: ${issues.join("; ")}`, 422, "INVALID_CHART_SPEC", issues);
    }
    return parsed.data;
  });
}

function dashboardId(req: Request): string {
  return String(req.params["id"] ?? "");
}

function notFound(): AppError {
  return new AppError("Dashboard not found", 404, "NOT_FOUND");
}

export async function listAiDashboards(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await dashboards.listDashboards() });
}

export async function getAiDashboard(req: Request, res: Response): Promise<void> {
  const board = await dashboards.getDashboard(dashboardId(req));
  if (!board) throw notFound();
  res.json({ success: true, data: board });
}

export async function createAiDashboard(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dashboardBodySchema>;
  const board = await dashboards.createDashboard({
    title: body.title,
    charts: validateCharts(body.charts),
    createdBy: req.user?.userId ?? null,
  });
  res.status(201).json({ success: true, data: board });
}

export async function updateAiDashboard(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dashboardBodySchema>;
  const board = await dashboards.updateDashboard(dashboardId(req), {
    title: body.title,
    charts: validateCharts(body.charts),
  });
  if (!board) throw notFound();
  res.json({ success: true, data: board });
}

export async function deleteAiDashboard(req: Request, res: Response): Promise<void> {
  if (!(await dashboards.deleteDashboard(dashboardId(req)))) throw notFound();
  res.json({ success: true, data: { deleted: true } });
}
