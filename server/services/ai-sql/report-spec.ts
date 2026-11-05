/**
 * AI Insights figures and reports (ported from SMEEP, which took them from Sama).
 *
 * A figure is never a set of numbers the model wrote down. It is the *request*
 * that produced them — a SELECT against the `ai` schema — so the chat draws
 * what the database returned, and the server re-runs every request when it
 * builds a report. A number in a downloaded PDF can only be one a query
 * actually returned. Mirrored by `ReportSpec` in client/lib/api/adminAi.ts.
 */
import { z } from "zod";
import { MAX_SQL_LENGTH } from "./limits";

export const FIGURE_CHARTS = ["bar", "horizontal_bar", "line", "donut", "stat", "table"] as const;
export type FigureChart = (typeof FIGURE_CHARTS)[number];

export const REPORT_FORMATS = ["pdf", "xlsx"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const reportFigureSchema = z.object({
  /** Sama's discriminator, kept so SMEEP and Hadafi share one contract: only programme (database) figures here. */
  source: z.literal("programme").default("programme"),
  sql: z.string().trim().min(1).max(MAX_SQL_LENGTH),
  number: z.number().int().min(1).max(99),
  title: z.string().trim().min(1).max(140),
  chart: z.enum(FIGURE_CHARTS),
  /** The category column; the first text column when omitted. */
  x: z.string().max(80).optional(),
  /** The value columns; every numeric column but x when omitted. */
  y: z.array(z.string().max(80)).max(4).optional(),
});
export type ReportFigure = z.infer<typeof reportFigureSchema>;

export const reportSpecSchema = z
  .object({
    /** Optional here: `?format=` on the URL is accepted too; PDF by default. */
    format: z.enum(REPORT_FORMATS).optional(),
    title: z.string().trim().min(1).max(140),
    summary: z.string().trim().max(3_000).default(""),
    sections: z
      .array(
        z.object({
          heading: z.string().trim().min(1).max(140),
          body: z.string().trim().max(5_000).default(""),
          figures: z.array(reportFigureSchema).max(6).default([]),
        }),
      )
      .min(1)
      .max(8),
  })
  .refine((spec) => spec.sections.reduce((n, s) => n + s.figures.length, 0) <= 12, {
    message: "A report carries at most twelve figures.",
    path: ["sections"],
  });
export type ReportSpec = z.infer<typeof reportSpecSchema>;

/** "lessons_completed" → "Lessons completed", "score_pct" → "Score %". */
export function columnLabel(column: string): string {
  const words = column
    .replace(/_pct$/, " %")
    .replace(/_usd$/, " (USD)")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Which column is the category and which carry values — the figure's own
 * choice first, then the first non-numeric column and every numeric one.
 */
export function figureAxes(
  columns: string[],
  rows: (string | number | null)[][],
  chosen: { x?: string; y?: string[] } = {},
): { x: number; y: number[] } {
  const numeric = (i: number) => rows.some((row) => typeof row[i] === "number");
  let x = chosen.x ? columns.indexOf(chosen.x) : -1;
  if (x < 0) x = columns.findIndex((_, i) => !numeric(i));
  if (x < 0) x = 0;
  let y = (chosen.y ?? []).map((name) => columns.indexOf(name)).filter((i) => i >= 0 && i !== x);
  if (y.length === 0) y = columns.map((_, i) => i).filter((i) => i !== x && numeric(i));
  return { x, y: y.slice(0, 3) };
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** bigint and numeric can arrive as strings; a chart needs numbers. */
export function toFigureCell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  return NUMERIC_TEXT.test(text) ? Number(text) : text;
}
