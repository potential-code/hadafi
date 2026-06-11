import type { Request, Response, NextFunction } from "express";
import * as analyticsService from "../services/admin.analytics.service";
import type { AnalyticsRange } from "../services/admin.analytics.service";

function parseRange(req: Request): AnalyticsRange {
  const r = req.query["range"];
  if (r === "7d" || r === "30d" || r === "12m") return r;
  return "12m"; // default
}

/** GET /api/admin/stats — used by Overview dashboard, unchanged */
export async function getKpiStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await analyticsService.getKpiStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/kpi-overview?range= */
export async function getOverviewKpis(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getOverviewKpis(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/user-growth?range= */
export async function getUserGrowthTrend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getUserGrowthTrend(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/enrollments — unchanged, used by Overview dashboard */
export async function getEnrollmentTrend(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getEnrollmentTrend();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-engagement — unchanged, used by Overview dashboard */
export async function getCourseEngagement(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCourseEngagement();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-completion?range= */
export async function getCourseCompletionRates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCourseCompletionRates(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-performance */
export async function getCoursePerformance(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCoursePerformance();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-kpis */
export async function getStakeholderKpis(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderKpis();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-trend?range= */
export async function getStakeholderTrend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderTrend(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-trend-by-type?range= */
export async function getStakeholderTrendByType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderTrendByType(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
