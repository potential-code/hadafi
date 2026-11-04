/**
 * AI Dashboard — the CHARTING half of the catalogue, and the chart spec a
 * saved board stores (ported from SMEEP, which took it from VX Academy).
 *
 * The `sql-1.x` catalogue describes the data; this module describes the
 * PICTURES: which chart types Hadafi's board can draw, what each needs in order
 * to be drawable, and the shape of a chart spec.
 *
 * AI_SQL_CHART_TYPES mirrors `AI_CHART_TYPES` in client/lib/api/adminAi.ts —
 * same order, same spelling. A type the renderer cannot draw must never be
 * advertised to the dashboardBuilder agent.
 *
 * A descriptor is DECLARATIVE: it states what a chart type needs, so
 * potential-ai's coherence check never has to know what "pie" means. Every
 * flag is optional and the defaults are the permissive reading —
 * `needsX:false, numericX:false, minSeries:1, maxSeries:1, singleValue:false`
 * — so only the flags that diverge are sent.
 */

import { z } from "zod";
import { MAX_SQL_LENGTH } from "./limits";

export const AI_SQL_CHART_TYPES = [
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "grouped_bar",
  "line",
  "area",
  "stacked_area",
  "combo",
  "pie",
  "donut",
  "table",
  "kpi",
  "funnel",
  "scatter",
] as const;

export type AiSqlChartType = (typeof AI_SQL_CHART_TYPES)[number];

/** Matches VALUE_FORMATS in potential-ai's dashboardBuilder/spec.ts. */
export const AI_VALUE_FORMATS = ["number", "percent", "duration_days", "hours"] as const;

/** Most value columns one chart may plot — potential-ai's own ceiling. */
const MAX_SERIES = 12;

export interface ChartDescriptor {
  id: AiSqlChartType;
  needsX?: boolean;
  numericX?: boolean;
  minSeries?: number;
  maxSeries?: number;
  singleValue?: boolean;
}

export const CHART_DESCRIPTORS: readonly ChartDescriptor[] = [
  // Everything with a category axis needs an x; multi-series marks take more
  // than the default single value column.
  { id: "bar", needsX: true },
  { id: "horizontal_bar", needsX: true },
  { id: "stacked_bar", needsX: true, maxSeries: MAX_SERIES },
  { id: "grouped_bar", needsX: true, maxSeries: MAX_SERIES },
  { id: "line", needsX: true, maxSeries: MAX_SERIES },
  { id: "area", needsX: true, maxSeries: MAX_SERIES },
  { id: "stacked_area", needsX: true, maxSeries: MAX_SERIES },
  // A combo draws bars AND a line, so one value column is not a combo at all.
  { id: "combo", needsX: true, minSeries: 2, maxSeries: MAX_SERIES },
  // One slice per axis value, one measure.
  { id: "pie", needsX: true },
  { id: "donut", needsX: true },
  // A table prints every column the query returned and needs no axis.
  { id: "table", maxSeries: MAX_SERIES },
  // One number, so no axis and no series.
  { id: "kpi", singleValue: true },
  // Stage order is row order, so the axis column is the stage label.
  { id: "funnel", needsX: true },
  // The one type whose x must be a number rather than a label.
  { id: "scatter", needsX: true, numericX: true, maxSeries: 2 },
];

/**
 * What a saved board stores per chart: the SELECT plus how its columns map
 * onto a picture. Deliberately NOT strict about the encoding naming real
 * columns — the query has not run at save time, and the renderer reports a
 * mismatch on the card. This only rejects things that could never be a chart.
 * The SQL itself is guarded on every execution, not here.
 */
export const sqlChartSpecSchema = z.object({
  sql: z.string().trim().min(1, "sql is required").max(MAX_SQL_LENGTH),
  chartType: z.enum(AI_SQL_CHART_TYPES),
  encoding: z.object({
    x: z.string().trim().min(1).optional(),
    y: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1).max(MAX_SERIES)]),
    series: z.string().trim().min(1).optional(),
  }),
  valueFormat: z.enum(AI_VALUE_FORMATS).optional(),
  title: z.string().trim().max(200).optional(),
});

export type SqlChartSpec = z.infer<typeof sqlChartSpecSchema>;

/** Problems with one spec, as a flat list — one correction round-trip, not five. */
export function chartSpecIssues(error: z.ZodError): string[] {
  return error.issues.map((e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message));
}

/**
 * Parse one stored chart; `null` rather than throwing, because this is also
 * the READ path for saved boards, which must degrade rather than break.
 */
export function parseSqlChartSpec(value: unknown): SqlChartSpec | null {
  const parsed = sqlChartSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
