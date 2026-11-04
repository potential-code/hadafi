'use client'

/**
 * One numbered figure in the AI Insights transcript: the chart Hana asked
 * for, drawn from the rows the query actually returned, with the SQL behind it
 * one click away. Horizontal bars and stat tiles are plain markup, which
 * stays crisp where an SVG axis would crowd.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Check, ChevronRight, Copy, Database } from 'lucide-react'
import { chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { columnLabel, figureAxes, firstEntrance, useFigure, type Figure, type FigureCell } from './figure-store'
import { humanLabel } from '@/lib/humanLabel'

const SERIES = chartColors.series
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/

/** Postgres hands a date back as "2026-07-27T00:00:00.000Z"; nobody should read that. */
function dayOf(text: string, withYear = false): string {
  const d = new Date(`${text.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return text
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  // The first of a month in a monthly series reads as the month.
  if (d.getUTCDate() === 1 && !withYear) return `${m} ${String(d.getUTCFullYear()).slice(2)}`
  return withYear ? `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${m}`
}

export const formatCell = (value: FigureCell) =>
  typeof value === 'number'
    ? value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
    : value === null
      ? '—'
      : DATE_LIKE.test(value)
        ? dayOf(value, true)
        : String(value)

/** A category as an axis can show it, cut to what fits the number of bars. */
function shortLabel(value: unknown, room = 14): string {
  const text = String(value ?? '')
  if (DATE_LIKE.test(text)) return dayOf(text)
  const head = text.split(/\s+[—–-]\s+|:\s/)[0]
  return head.length > room ? `${head.slice(0, room - 1)}…` : head
}

function HorizontalBars({ figure, x, value }: { figure: Figure; x: number; value: number }) {
  // A ranking reads biggest first, whatever order the data arrived in.
  const rows = [...figure.rows].sort((a, b) => (Number(b[value]) || 0) - (Number(a[value]) || 0)).slice(0, 12)
  const max = Math.max(1, ...rows.map((row) => Number(row[value]) || 0))
  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => {
        const amount = Number(row[value]) || 0
        return (
          <li key={i} className="text-[13px]">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ui-text" title={humanLabel(String(row[x] ?? ''))}>
                {humanLabel(formatCell(row[x]))}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ui-text">{formatCell(row[value])}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ui-surface-2">
              <div
                className="ai-bar h-full rounded-full"
                style={{
                  width: `${(amount / max) * 100}%`,
                  background: i === 0 ? chartColors.brand : SERIES[1],
                  animationDelay: `${i * 40}ms`,
                }}
              />
            </div>
          </li>
        )
      })}
      {figure.rows.length > rows.length && (
        <li className="text-xs text-ui-muted">{figure.rows.length - rows.length} more in the report download.</li>
      )}
    </ul>
  )
}

function Stats({ figure }: { figure: Figure }) {
  const row = figure.rows[0] ?? []
  const items = figure.columns
    .map((column, i) => ({ label: columnLabel(column), value: row[i] }))
    .filter((item) => typeof item.value === 'number')
    .slice(0, 4)
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn('rounded-[10px] px-3 py-2.5', i === 0 ? 'bg-ui-brand-soft' : 'bg-ui-surface-2')}
        >
          <p
            className={cn(
              'text-[22px] font-semibold leading-none tabular-nums',
              i === 0 ? 'text-ui-brand-text' : 'text-ui-text',
            )}
          >
            {formatCell(item.value)}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-ui-muted">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

function DataTable({ figure }: { figure: Figure }) {
  const columns = figure.columns.slice(0, 6)
  const numeric = columns.map((_, i) => figure.rows.some((row) => typeof row[i] === 'number'))
  return (
    <div className="max-h-72 overflow-auto rounded-[10px] border border-ui-line">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-ui-surface-2">
          <tr>
            {columns.map((column, i) => (
              <th
                key={column}
                className={cn('px-2.5 py-1.5 text-xs font-semibold text-ui-muted', numeric[i] ? 'text-right' : 'text-left')}
              >
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {figure.rows.map((row, r) => (
            <tr key={r} className="border-t border-ui-line">
              {columns.map((column, i) => (
                <td key={column} className={cn('px-2.5 py-1.5 text-ui-text', numeric[i] ? 'text-right tabular-nums' : '')}>
                  {formatCell(row[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Donut({ figure, x, value }: { figure: Figure; x: number; value: number }) {
  const sorted = [...figure.rows].sort((a, b) => (Number(b[value]) || 0) - (Number(a[value]) || 0))
  const slices = sorted.slice(0, 5).map((row) => ({ name: humanLabel(String(row[x] ?? '—')), value: Number(row[value]) || 0 }))
  const rest = sorted.slice(5).reduce((sum, row) => sum + (Number(row[value]) || 0), 0)
  if (rest > 0) slices.push({ name: 'Other', value: rest })
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="none" paddingAngle={1}>
              {slices.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCell(v)} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-ui-text">
          {formatCell(total)}
        </span>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {slices.map((slice, i) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-ui-text">{slice.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ui-text">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Chart({ figure }: { figure: Figure }) {
  const { x, y } = figureAxes(figure.columns, figure.rows, figure)
  if (figure.rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ui-muted">No rows, so there is nothing to draw.</p>
  }
  // Many categories turn on their side so the labels fit, but a date series
  // stays on a time axis, where sideways bars would read as a ranking.
  const dated = figure.rows.some((row) => typeof row[x] === 'string' && DATE_LIKE.test(row[x] as string))
  const chart = figure.chart === 'bar' && figure.rows.length > 8 && !dated ? 'horizontal_bar' : figure.chart
  if (chart === 'stat') return <Stats figure={figure} />
  if (chart === 'table' || y.length === 0) return <DataTable figure={figure} />
  if (chart === 'horizontal_bar') return <HorizontalBars figure={figure} x={x} value={y[0]} />
  if (chart === 'donut') return <Donut figure={figure} x={x} value={y[0]} />

  const room = figure.rows.length <= 4 ? 18 : figure.rows.length <= 6 ? 14 : 10
  const peak = Math.max(0, ...figure.rows.flatMap((row) => y.map((col) => Number(row[col]) || 0)))
  const yWidth = Math.max(32, formatCell(Math.ceil(peak)).length * 7 + 12)
  const data = figure.rows.map((row) => {
    const point: Record<string, string | number> = { label: humanLabel(String(row[x] ?? '')) }
    y.forEach((col) => (point[figure.columns[col]] = Number(row[col]) || 0))
    return point
  })
  const legend = y.length > 1 && (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ui-muted">
      {y.map((col, s) => (
        <span key={col} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[s] }} />
          {columnLabel(figure.columns[col])}
        </span>
      ))}
    </div>
  )
  // Recharts reads its children's types directly, so shared axes go in as an
  // array; wrapped in a fragment they are silently ignored.
  const axes = [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke={chartColors.line} vertical={false} />,
    <XAxis
      key="x"
      dataKey="label"
      tickFormatter={(v) => shortLabel(v, room)}
      interval={figure.rows.length <= 8 ? 0 : 'preserveStartEnd'}
      tick={{ fontSize: 11, fill: chartColors.muted }}
      tickLine={false}
      axisLine={false}
      minTickGap={8}
    />,
    <YAxis
      key="y"
      tick={{ fontSize: 11, fill: chartColors.muted }}
      tickLine={false}
      axisLine={false}
      width={yWidth}
      allowDecimals={false}
    />,
    <Tooltip
      key="tip"
      {...chartTooltipStyle}
      labelFormatter={(v) => shortLabel(v, 40)}
      formatter={(v: number, name: string) => [formatCell(v), columnLabel(name)]}
    />,
  ]

  return (
    <div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chart === 'line' ? (
            <LineChart data={data} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
              {axes}
              {y.map((col, s) => (
                <Line
                  key={col}
                  type="monotone"
                  dataKey={figure.columns[col]}
                  stroke={SERIES[s]}
                  strokeWidth={2}
                  dot={data.length <= 14 ? { r: 2.5 } : false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
              {axes}
              {y.map((col, s) => (
                <Bar key={col} dataKey={figure.columns[col]} fill={SERIES[s]} radius={[4, 4, 0, 0]} maxBarSize={36} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {legend}
    </div>
  )
}

function SqlBehind({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(sql)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }, [sql])

  return (
    <details className="group border-t border-ui-line">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-ui-muted hover:text-ui-text [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
        The query behind this figure
      </summary>
      <div className="flex items-start gap-2 px-4 pb-3">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-[10px] border border-ui-line bg-ui-surface-2 p-2.5 font-mono text-xs leading-relaxed text-ui-text">
          {sql}
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Query copied' : 'Copy query'}
          title={copied ? 'Query copied' : 'Copy query'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ui-line bg-ui-surface text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-ui-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
    </details>
  )
}

export function FigureCard({ toolCallId }: { toolCallId: string }) {
  const figure = useFigure(toolCallId)
  // Rises in the first time its rows arrive, and never again.
  const ready = figure?.status === 'ready'
  const rise = useMemo(() => ready && firstEntrance(toolCallId), [ready, toolCallId])
  if (!figure) return null

  return (
    <figure
      className={cn('my-2 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui', rise && 'ai-figure')}
      data-testid="ai-figure"
    >
      <figcaption className="px-4 pt-3.5">
        <p className="text-[15px] font-semibold leading-snug text-ui-text">
          <span className="text-ui-brand-text">Figure {figure.number}</span>
          <span className="mx-1.5 text-ui-line">/</span>
          {figure.title}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ui-muted">
          <Database className="h-3 w-3" aria-hidden />
          Hadafi data
          {figure.status === 'ready' &&
            ` · ${figure.rows.length} row${figure.rows.length === 1 ? '' : 's'}${figure.truncated ? ' (truncated)' : ''}`}
        </p>
      </figcaption>

      <div className="px-4 py-3.5">
        {figure.status === 'loading' && (
          <div className="space-y-2" aria-label="Drawing the figure">
            <div className="ai-shimmer h-3 w-2/3 rounded" />
            <div className="ai-shimmer h-36 rounded-[10px]" />
          </div>
        )}
        {figure.status === 'failed' && (
          <p className="flex items-start gap-1.5 text-[13px] text-ui-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="whitespace-pre-line">{figure.error ?? 'This figure could not be drawn.'}</span>
          </p>
        )}
        {figure.status === 'ready' && <Chart figure={figure} />}
      </div>

      <SqlBehind sql={figure.sql} />
    </figure>
  )
}
