/**
 * AI Dashboard: encoding-driven chart data.
 *
 * The agent writes its own SELECT, so the only thing tying a column to a
 * visual role is the spec's `encoding`. This module turns `{columns, rows}`
 * plus an encoding into the flat records Recharts wants. It is deliberately
 * forgiving: a column missing from the SELECT list, a text column used as a
 * measure, hundreds of series are expected traffic, and each must end as a
 * readable message on the card, never a thrown render.
 */
import type { AiChartEncoding, AiChartSpec, AiValueFormat, SqlValue } from '@/lib/api/adminAi'
import { humanLabel } from '@/lib/humanLabel'

/** Stable identity for a spec: the React Query key for its rows. */
export function specCacheKey(spec: AiChartSpec): string {
  return JSON.stringify({
    sql: spec.sql.trim(),
    chartType: spec.chartType,
    encoding: {
      x: spec.encoding?.x ?? null,
      y: normaliseY(spec.encoding?.y),
      series: spec.encoding?.series ?? null,
    },
    valueFormat: spec.valueFormat ?? 'number',
  })
}

// ── Formatting ────────────────────────────────────────────────────────────────

const round = (value: number, places: number): number => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function formatMeasure(value: number | null | undefined, format: AiValueFormat | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  switch (format) {
    case 'percent':
      return `${round(value, 1).toLocaleString('en-GB')}%`
    case 'duration_days': {
      const days = round(value, 1)
      return `${days.toLocaleString('en-GB')} ${Math.abs(days) === 1 ? 'day' : 'days'}`
    }
    case 'hours':
      return `${round(value, 1).toLocaleString('en-GB')}h`
    default:
      return round(value, 2).toLocaleString('en-GB')
  }
}

/** Short form for axis ticks, where the unit is implied by the title. */
export function formatAxisTick(value: number | string, format: AiValueFormat | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value ?? '')
  return format === 'percent' ? `${round(numeric, 1)}%` : round(numeric, 2).toLocaleString('en-GB')
}

/** `completion_rate` → `Completion rate`. */
export function prettifyColumn(name: string): string {
  const text = name.replace(/_/g, ' ').trim()
  return text.length === 0 ? name : text.charAt(0).toUpperCase() + text.slice(1)
}

/** The agent's title, else something honest derived from the encoding. */
export function chartTitle(spec: AiChartSpec): string {
  if (spec.title && spec.title.trim().length > 0) return spec.title.trim()
  const ys = normaliseY(spec.encoding?.y)
  const measure =
    ys.length === 0 ? 'Result' : ys.length === 1 ? prettifyColumn(ys[0]) : `${prettifyColumn(ys[0])} and ${ys.length - 1} more`
  const by = spec.encoding?.series ?? spec.encoding?.x
  return by ? `${measure} by ${prettifyColumn(by)}` : measure
}

/** One-line caption under the title. */
export function chartSubtitle(spec: AiChartSpec): string {
  const kind = spec.chartType.replace(/_/g, ' ')
  const parts = [kind.charAt(0).toUpperCase() + kind.slice(1)]
  const by = [spec.encoding?.x, spec.encoding?.series].filter((value): value is string => !!value)
  if (by.length > 0) parts.push(`by ${by.map((b) => prettifyColumn(b).toLowerCase()).join(', ')}`)
  return parts.join(' · ')
}

// ── The adapter ───────────────────────────────────────────────────────────────

/** Axis value key. Not a column name, so it cannot collide with a series. */
export const X_KEY = '__x'
/** Numeric form of the axis value, for `scatter`. */
export const X_NUM_KEY = '__xNum'

/** More series than this is unreadable; extra ones are dropped with a note. */
const MAX_SERIES = 20

export interface EncodedChartData {
  rows: Array<Record<string, string | number | null>>
  seriesKeys: string[]
  seriesLabels: Record<string, string>
  xLabel: string
  xIsNumeric: boolean
  /** Set when nothing can be drawn: render this instead of a chart. */
  fatal: string | null
  /** Drawable, but the viewer should know something was dropped or coerced. */
  notes: string[]
}

function normaliseY(y: string | string[] | undefined): string[] {
  const list = Array.isArray(y) ? y : y ? [y] : []
  const seen = new Set<string>()
  return list.filter((name) => {
    if (typeof name !== 'string' || name.trim().length === 0) return false
    const key = name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Postgres down-cases unquoted identifiers; the agent is not always careful. */
function indexOfColumn(columns: string[], name: string): number {
  const exact = columns.indexOf(name)
  if (exact !== -1) return exact
  const lower = name.trim().toLowerCase()
  return columns.findIndex((c) => c.toLowerCase() === lower)
}

function toNumber(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  const text = value.trim()
  if (text.length === 0) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const EMPTY: EncodedChartData = {
  rows: [],
  seriesKeys: [],
  seriesLabels: {},
  xLabel: '',
  xIsNumeric: false,
  fatal: null,
  notes: [],
}

/**
 * Pivots `{columns, rows}` into Recharts records. With `encoding.series` set,
 * one series per distinct value of that column measured by `y[0]` (missing
 * combinations read as zero); without it, one series per `y` column. Never
 * throws.
 */
export function buildEncodedChartData(
  columns: string[],
  rows: SqlValue[][],
  encoding: AiChartEncoding | undefined,
  options: { requireX?: boolean } = {},
): EncodedChartData {
  const notes: string[] = []
  const available = columns.join(', ') || 'none'

  const yNames = normaliseY(encoding?.y)
  if (yNames.length === 0) return { ...EMPTY, fatal: 'This chart has no value column (`encoding.y`).' }

  const missing: string[] = []
  const yIndexes = yNames.map((name) => {
    const at = indexOfColumn(columns, name)
    if (at === -1) missing.push(name)
    return at
  })

  const xName = encoding?.x?.trim() || ''
  let xIndex = xName ? indexOfColumn(columns, xName) : -1
  if (xName && xIndex === -1) missing.push(xName)

  const seriesName = encoding?.series?.trim() || ''
  const seriesIndex = seriesName ? indexOfColumn(columns, seriesName) : -1
  if (seriesName && seriesIndex === -1) missing.push(seriesName)

  if (missing.length > 0) {
    return {
      ...EMPTY,
      fatal:
        `The chart refers to ${missing.map((m) => `"${m}"`).join(', ')}, which ` +
        `${missing.length === 1 ? 'is' : 'are'} not in the result. Columns returned: ${available}.`,
    }
  }

  if (!xName && options.requireX) {
    // No axis named: use the first column that isn't a measure, nearly always
    // the label the agent forgot to encode.
    const fallback = columns.findIndex((_, i) => !yIndexes.includes(i) && i !== seriesIndex)
    if (fallback === -1) return { ...EMPTY, fatal: 'This chart has no category column (`encoding.x`).' }
    xIndex = fallback
    notes.push(`No x encoding, so "${columns[fallback]}" is used as the axis.`)
  }

  const xLabel = xIndex === -1 ? '' : prettifyColumn(columns[xIndex])
  if (rows.length === 0) return { ...EMPTY, xLabel }

  const axisValue = (row: SqlValue[], i: number): string => {
    if (xIndex === -1) return String(i + 1)
    const raw = row[xIndex]
    return raw === null || raw === undefined || raw === '' ? '—' : humanLabel(String(raw))
  }

  let built: EncodedChartData

  if (seriesIndex !== -1) {
    if (yNames.length > 1) notes.push(`A series column pivots one measure, so only "${yNames[0]}" is plotted.`)
    const measureIndex = yIndexes[0]
    const seriesKeys: string[] = []
    const byAxis = new Map<string, Record<string, string | number | null>>()

    rows.forEach((row, i) => {
      const axis = axisValue(row, i)
      const rawKey = row[seriesIndex]
      let key = rawKey === null || rawKey === undefined || rawKey === '' ? 'Unknown' : String(rawKey)
      if (key === X_KEY || key === X_NUM_KEY) key = `${key} `
      if (!seriesKeys.includes(key)) seriesKeys.push(key)
      const entry = byAxis.get(axis) ?? { [X_KEY]: axis }
      entry[key] = toNumber(row[measureIndex])
      byAxis.set(axis, entry)
    })

    const kept = seriesKeys.slice(0, MAX_SERIES)
    if (seriesKeys.length > kept.length) {
      notes.push(
        `Showing the first ${kept.length} of ${seriesKeys.length} series. Group "${columns[seriesIndex]}" in SQL for a readable chart.`,
      )
    }

    const records = Array.from(byAxis.values()).map((entry) => {
      const record: Record<string, string | number | null> = { [X_KEY]: entry[X_KEY] ?? '—' }
      for (const key of kept) record[key] = entry[key] ?? 0
      return record
    })

    built = {
      rows: records,
      seriesKeys: kept,
      seriesLabels: Object.fromEntries(kept.map((k) => [k, humanLabel(k)])),
      xLabel,
      xIsNumeric: false,
      fatal: null,
      notes,
    }
  } else {
    const records = rows.map((row, i) => {
      const record: Record<string, string | number | null> = { [X_KEY]: axisValue(row, i) }
      yNames.forEach((name, j) => {
        record[name] = toNumber(row[yIndexes[j]])
      })
      return record
    })

    built = {
      rows: records,
      seriesKeys: [...yNames],
      seriesLabels: Object.fromEntries(yNames.map((name) => [name, prettifyColumn(name)])),
      xLabel,
      xIsNumeric: false,
      fatal: null,
      notes,
    }
  }

  const numeric = built.seriesKeys.filter((key) => built.rows.some((row) => typeof row[key] === 'number'))
  if (numeric.length === 0) {
    return {
      ...EMPTY,
      xLabel,
      fatal:
        `No numeric values to plot: ${built.seriesKeys.map((k) => `"${k}"`).join(', ')} ` +
        `${built.seriesKeys.length === 1 ? 'is' : 'are'} not a number. Cast the measure in SQL, or use a table.`,
    }
  }
  if (numeric.length < built.seriesKeys.length) {
    const dropped = built.seriesKeys.filter((k) => !numeric.includes(k))
    built.notes.push(`Skipped ${dropped.map((k) => `"${k}"`).join(', ')}: not numeric.`)
    built.seriesKeys = numeric
  }

  let allNumeric = true
  for (const record of built.rows) {
    const parsed = toNumber(record[X_KEY] as SqlValue)
    record[X_NUM_KEY] = parsed
    if (parsed === null) allNumeric = false
  }
  built.xIsNumeric = allNumeric

  return built
}
