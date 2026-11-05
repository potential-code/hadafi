/**
 * Admin AI analytics (AI Insights + AI Dashboard): client API layer.
 *
 * Everything sits under `/api/admin/ai` (admin only). The agents in
 * potential-ai are only ever shown the CATALOGUE (view and column names,
 * grains, enum values, prose); every statement they write is run here, by the
 * Hadafi server, behind its read-only guard. A rejected statement comes back as
 * a 400 whose message is the agent's correction signal, so `sqlErrorMessage`
 * returns it verbatim rather than softening it.
 */
import { apiFetch } from '@/lib/api'

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface SqlCatalogColumn {
  name: string
  type: string
  description?: string
}

export interface SqlCatalogView {
  name: string
  /** What one row means, e.g. "one row per learner". */
  grain?: string
  description?: string
  columns: SqlCatalogColumn[]
}

/** The sql-1.x catalogue. Loose on purpose: the server may add fields. */
export interface SqlCatalog {
  version: string
  dialect?: string
  schema?: string
  /** ISO8601, when the reporting views were last refreshed (or null). */
  refreshedAt?: string | null
  views: SqlCatalogView[]
  enums?: Record<string, string[]>
  notes?: string[]
  instructions?: string[]
  limits?: { maxRows?: number; statementTimeoutMs?: number; maxQueriesPerTurn?: number }
  /** Dashboard builder only: the chart types the board can draw. */
  chartTypes?: string[]
  [key: string]: unknown
}

// ── Query ────────────────────────────────────────────────────────────────────

/** One cell. Postgres types arrive narrowed to JSON scalars. */
export type SqlValue = string | number | boolean | null

export interface SqlQueryResult {
  columns: string[]
  columnTypes?: string[]
  rows: SqlValue[][]
  rowCount: number
  /** True when the server clipped the result at its row cap. */
  truncated: boolean
  elapsedMs?: number
}

type Envelope<T> = { success: boolean; data: T }

export async function fetchAiCatalog(): Promise<SqlCatalog> {
  const res = await apiFetch<Envelope<SqlCatalog>>('/api/admin/ai/catalog')
  return res.data
}

export async function runAiSql(sql: string): Promise<SqlQueryResult> {
  const res = await apiFetch<Envelope<SqlQueryResult>>('/api/admin/ai/query', {
    method: 'POST',
    body: JSON.stringify({ sql }),
  })
  return res.data
}

/**
 * The text the agent reads when a statement is refused: the guard's reasons
 * (one per line) or the Postgres error, never a generic "something went wrong".
 */
export function sqlErrorMessage(error: unknown): string {
  const body = error as
    | {
        message?: unknown
        errors?: unknown
        error?: { message?: unknown; errors?: unknown; details?: { errors?: unknown } } | string
      }
    | undefined
  const nested = typeof body?.error === 'object' ? body.error : undefined
  const list = [nested?.details?.errors, nested?.errors, body?.errors].find(
    (value): value is unknown[] => Array.isArray(value) && value.length > 0,
  )
  if (list) return list.map(String).join('\n')
  if (typeof nested?.message === 'string' && nested.message) return nested.message
  if (typeof body?.error === 'string' && body.error) return body.error
  if (typeof body?.message === 'string' && body.message) return body.message
  return 'The query could not be run.'
}

/** The server's error code (`apiFetch` throws the parsed body, which carries no HTTP status). */
export function errorCode(error: unknown): string | undefined {
  const nested = (error as { error?: unknown } | undefined)?.error
  const code = nested && typeof nested === 'object' ? (nested as { code?: unknown }).code : undefined
  return typeof code === 'string' ? code : undefined
}

/**
 * Codes meaning AI analytics is not switched on for this environment (no
 * read-only database connection, the reporting views missing, or the
 * read-only role refused as unsafe), rather than a passing failure.
 */
const NOT_SET_UP_CODES = new Set(['AI_READONLY_NOT_CONFIGURED', 'AI_ANALYTICS_NOT_INSTALLED', 'AI_READONLY_ROLE_UNSAFE'])

export function isAiNotSetUp(error: unknown): boolean {
  const code = errorCode(error)
  return code !== undefined && NOT_SET_UP_CODES.has(code)
}

// ── Reports (AI Insights) ────────────────────────────────────────────────────

export const FIGURE_CHARTS = ['bar', 'horizontal_bar', 'line', 'donut', 'stat', 'table'] as const
export type FigureChart = (typeof FIGURE_CHARTS)[number]

/** A figure as the server re-runs it: the request, never the numbers. */
export interface ReportFigure {
  source: 'programme'
  sql: string
  number: number
  title: string
  chart: FigureChart
  x?: string
  y?: string[]
}

export interface ReportSpec {
  format: 'pdf' | 'xlsx'
  title: string
  summary: string
  sections: { heading: string; body: string; figures: ReportFigure[] }[]
}

/**
 * Builds the report on the server (which re-runs every figure's SQL) and
 * saves the file it returns.
 */
export async function downloadAiReport(spec: ReportSpec): Promise<void> {
  const response = await fetch('/api/admin/ai/report', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } | string } | null
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new Error(message || 'The report could not be built. Try again in a moment.')
  }
  const disposition = response.headers.get('content-disposition') ?? ''
  const fileName =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]?.replace(/%20/g, ' ') ??
    /filename="([^"]+)"/i.exec(disposition)?.[1] ??
    `hadafi-report.${spec.format}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  try {
    link.download = decodeURIComponent(fileName)
  } catch {
    link.download = fileName
  }
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ── Dashboards (AI Dashboard) ────────────────────────────────────────────────

export const AI_CHART_TYPES = [
  'bar',
  'horizontal_bar',
  'stacked_bar',
  'grouped_bar',
  'line',
  'area',
  'stacked_area',
  'combo',
  'pie',
  'donut',
  'table',
  'kpi',
  'funnel',
  'scatter',
] as const
export type AiChartType = (typeof AI_CHART_TYPES)[number]

export type AiValueFormat = 'number' | 'percent' | 'duration_days' | 'hours'

/** Column names from the chart's own SELECT list. */
export interface AiChartEncoding {
  /** Category / time axis. Optional only for `kpi` and `table`. */
  x?: string
  /** Measure column(s); `combo` draws y[0] as bars and the rest as lines. */
  y: string | string[]
  /** Column whose distinct values each become one series (a pivot). */
  series?: string
}

export interface AiChartSpec {
  sql: string
  chartType: AiChartType
  encoding: AiChartEncoding
  valueFormat?: AiValueFormat
  title?: string
}

export interface AiDashboard {
  id: string | number
  title: string
  charts: AiChartSpec[]
  createdAt: string
  updatedAt: string
}

export const aiDashboardKeys = {
  catalog: ['admin-ai', 'catalog'] as const,
  dashboards: ['admin-ai', 'dashboards'] as const,
  query: (specKey: string) => ['admin-ai', 'query', specKey] as const,
}

export async function listAiDashboards(): Promise<AiDashboard[]> {
  const res = await apiFetch<Envelope<AiDashboard[]>>('/api/admin/ai/dashboards')
  return res.data ?? []
}

export async function createAiDashboard(input: { title: string; charts: AiChartSpec[] }): Promise<AiDashboard> {
  const res = await apiFetch<Envelope<AiDashboard>>('/api/admin/ai/dashboards', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.data
}

export async function updateAiDashboard(
  id: string | number,
  input: { title: string; charts: AiChartSpec[] },
): Promise<AiDashboard> {
  const res = await apiFetch<Envelope<AiDashboard>>(`/api/admin/ai/dashboards/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return res.data
}

export async function deleteAiDashboard(id: string | number): Promise<void> {
  await apiFetch(`/api/admin/ai/dashboards/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}

/** A saved chart is only drawable if it still carries its statement. */
export function isAiChartSpec(spec: unknown): spec is AiChartSpec {
  return (
    !!spec &&
    typeof spec === 'object' &&
    typeof (spec as { sql?: unknown }).sql === 'string' &&
    typeof (spec as { chartType?: unknown }).chartType === 'string'
  )
}
