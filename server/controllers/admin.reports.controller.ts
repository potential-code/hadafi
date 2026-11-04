import type { Request, Response, NextFunction } from "express";
import * as impactService from "../services/admin.impact.service";
import * as learningGainService from "../services/admin.learningGain.service";
import * as exportsService from "../services/admin.exports.service";
import * as quizGen from "../services/lms/quizGenerator.service";

/** GET /api/admin/analytics/impact: the admin home's impact KPIs and charts. */
export async function getImpact(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ success: true, data: await impactService.getImpact() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/insights?range=7d|30d|12m: KPIs vs the previous period, and charts. */
export async function getInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = String(req.query["range"] ?? "30d");
    const range = (impactService.INSIGHT_RANGES as readonly string[]).includes(raw) ? (raw as impactService.InsightRange) : "30d";
    res.status(200).json({ success: true, data: await impactService.getAnalyticsInsights(range) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/learning-gain: pre-test vs final exam, overall and per course. */
export async function getLearningGain(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ success: true, data: await learningGainService.getLearningGain() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/exports/:dataset?format=csv|xlsx: a dataset as a spreadsheet download. */
export async function downloadExport(req: Request<{ dataset: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const dataset = req.params.dataset;
    if (!exportsService.isExportDataset(dataset)) {
      res.status(404).json({ success: false, error: { message: "Unknown export", code: "NOT_FOUND" } });
      return;
    }
    const format: exportsService.ExportFormat = req.query["format"] === "csv" ? "csv" : "xlsx";
    const file = await exportsService.buildExport(dataset, format);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Row-Count", String(file.rows));
    res.status(200).send(file.body);
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/quiz/generate: AI drafts for a pre-test or final exam (nothing saved). */
export async function generateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assessmentId, count, format } = req.body as { assessmentId: string; count: number; format: quizGen.QuizFormat };
    const questions = await quizGen.generateQuizDrafts(req.user!.userId, assessmentId, { count, format });
    res.status(200).json({ success: true, data: { questions } });
  } catch (err) {
    next(err);
  }
}
