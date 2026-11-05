'use client'

/**
 * AI Dashboard: one chart. Owns its own query, deliberately: a generated
 * statement can take seconds, so a board of eight charts never waits on the
 * slowest one. Each card shows its own skeleton and error, and paints as soon
 * as its own rows land. Nothing here knows what the columns MEAN, so every
 * state has to survive an encoding that does not match the result.
 */
import { useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { btn } from '@/components/kit'
import { IconButton, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { aiDashboardKeys, runAiSql, sqlErrorMessage, type AiChartSpec, type SqlQueryResult } from '@/lib/api/adminAi'
import { cn } from '@/lib/utils'
import {
  X_KEY,
  X_NUM_KEY,
  buildEncodedChartData,
  chartSubtitle,
  chartTitle,
  formatAxisTick,
  formatMeasure,
  prettifyColumn,
  specCacheKey,
} from './chartData'

const SERIES = chartColors.series
const CHART_HEIGHT = 300
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Axis label: dates read as "Mar 26" / "4 Mar", long text is cut. */
function axisLabel(value: unknown): string {
  const text = String(value ?? '')
  if (DATE_LIKE.test(text)) {
    const d = new Date(`${text.slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) {
      const m = MONTHS[d.getUTCMonth()]
      return d.getUTCDate() === 1 ? `${m} ${String(d.getUTCFullYear()).slice(2)}` : `${d.getUTCDate()} ${m}`
    }
  }
  return text.length > 18 ? `${text.slice(0, 17)}…` : text
}

const axisProps = {
  stroke: chartColors.muted,
  tick: { fontSize: 11, fill: chartColors.muted },
  tickLine: false,
} as const

function ChartNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center px-2" style={{ height: CHART_HEIGHT }}>
      <p className="w-full rounded-[10px] border border-ui-line bg-ui-surface-2 p-3 text-[13px] text-ui-muted">{message}</p>
    </div>
  )
}

function ChartNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <ul className="mt-2 space-y-0.5">
      {notes.map((note, i) => (
        <li key={i} className="text-xs text-ui-muted">
          {note}
        </li>
      ))}
    </ul>
  )
}

function ChartBody({ spec, result }: { spec: AiChartSpec; result: SqlQueryResult }) {
  // Gradient ids must be unique per card, or two area charts share one fill.
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const format = spec.valueFormat
  const data = useMemo(
    () =>
      buildEncodedChartData(result.columns, result.rows, spec.encoding, {
        requireX: spec.chartType !== 'kpi' && spec.chartType !== 'table',
      }),
    [result.columns, result.rows, spec.encoding, spec.chartType],
  )

  if (result.rows.length === 0) return <ChartNotice message="No data for this chart yet." />

  // Built from the envelope, not the encoding: a table is still useful when
  // the encoding is wrong, and every column is worth showing.
  if (spec.chartType === 'table') {
    const measures = new Set(data.seriesKeys.map((k) => k.toLowerCase()))
    return (
      <div className="overflow-auto rounded-[10px] border border-ui-line" style={{ maxHeight: CHART_HEIGHT }}>
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-ui-surface-2">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold text-ui-muted',
                    measures.has(column.toLowerCase()) ? 'text-right' : 'text-left',
                  )}
                >
                  {prettifyColumn(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-t border-ui-line">
                {result.columns.map((column, j) => {
                  const measure = measures.has(column.toLowerCase())
                  return (
                    <td key={column} className={cn('px-3 py-1.5 text-ui-text', measure && 'text-right font-medium tabular-nums')}>
                      {measure ? formatMeasure(Number(row[j]), format) : String(row[j] ?? '—')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.fatal) return <ChartNotice message={data.fatal} />

  const { rows, seriesKeys, seriesLabels } = data
  const label = (key: string) => seriesLabels[key] ?? key
  const color = (i: number) => SERIES[i % SERIES.length]

  const tooltip = (
    <Tooltip
      {...chartTooltipStyle}
      labelFormatter={(v) => axisLabel(v)}
      formatter={(value: unknown, name: unknown) => [formatMeasure(Number(value), format), String(name)]}
    />
  )
  const legend =
    seriesKeys.length > 1 ? <Legend verticalAlign="top" align="right" wrapperStyle={{ top: 0, fontSize: 12 }} /> : null
  const grid = <CartesianGrid strokeDasharray="3 3" stroke={chartColors.line} vertical={false} />
  // Counts never get "0.5" ticks.
  const wholeNumbers = rows.every((row) => seriesKeys.every((k) => row[k] === null || Number.isInteger(row[k])))
  const valueAxis = (
    <YAxis
      {...axisProps}
      axisLine={false}
      allowDecimals={!wholeNumbers}
      tickFormatter={(value: number | string) => formatAxisTick(value, format)}
    />
  )
  const manyCategories = rows.length > 8
  const categoryAxis = (
    <XAxis
      dataKey={X_KEY}
      {...axisProps}
      tickFormatter={axisLabel}
      interval={manyCategories ? 'preserveStartEnd' : 0}
      angle={manyCategories ? -35 : 0}
      textAnchor={manyCategories ? 'end' : 'middle'}
      height={manyCategories ? 64 : 30}
    />
  )

  if (spec.chartType === 'pie' || spec.chartType === 'donut') {
    const slices = rows
      .map((row) => ({ name: String(row[X_KEY] ?? '—'), value: Number(row[seriesKeys[0]]) || 0 }))
      .filter((slice) => slice.value > 0)
    if (slices.length === 0) {
      return <ChartNotice message="Every slice is zero or negative, so there is nothing to divide up. A bar chart would read better." />
    }
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={100}
              innerRadius={spec.chartType === 'donut' ? 60 : 0}
              dataKey="value"
              nameKey="name"
              stroke="var(--ui-surface)"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={color(i)} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipStyle} formatter={(value: unknown) => formatMeasure(Number(value), format)} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => axisLabel(value)} />
          </PieChart>
        </ResponsiveContainer>
        <ChartNotes notes={data.notes} />
      </>
    )
  }

  if (spec.chartType === 'funnel') {
    // Stage order is the row order.
    const stages = rows.map((row, i) => ({
      name: String(row[X_KEY] ?? `Stage ${i + 1}`),
      value: Number(row[seriesKeys[0]]) || 0,
    }))
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <FunnelChart margin={{ top: 10, right: 120, left: 20, bottom: 10 }}>
            <Tooltip {...chartTooltipStyle} formatter={(value: unknown) => formatMeasure(Number(value), format)} />
            <Funnel dataKey="value" nameKey="name" data={stages} lastShapeType="rectangle" isAnimationActive={false}>
              {stages.map((_, i) => (
                <Cell key={i} fill={color(i)} />
              ))}
              <LabelList position="right" dataKey="name" fill={chartColors.text} stroke="none" fontSize={11} />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
        <ChartNotes notes={data.notes} />
      </>
    )
  }

  if (spec.chartType === 'scatter') {
    if (!data.xIsNumeric) {
      return (
        <ChartNotice
          message={`A scatter chart needs a numeric x axis, and "${spec.encoding?.x ?? 'x'}" is not numeric. Plot it as a bar chart, or return the numeric column.`}
        />
      )
    }
    const groups = seriesKeys.map((key) => ({
      key,
      points: rows
        .filter((row) => typeof row[key] === 'number' && typeof row[X_NUM_KEY] === 'number')
        .map((row) => ({ [X_NUM_KEY]: row[X_NUM_KEY], __y: row[key], [X_KEY]: row[X_KEY] })),
    }))
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
            {grid}
            <XAxis type="number" dataKey={X_NUM_KEY} name={data.xLabel} {...axisProps} />
            <YAxis
              type="number"
              dataKey="__y"
              name={label(seriesKeys[0])}
              {...axisProps}
              axisLine={false}
              tickFormatter={(value: number | string) => formatAxisTick(value, format)}
            />
            <Tooltip {...chartTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
            {legend}
            {groups.map((group, i) => (
              <Scatter key={group.key} name={label(group.key)} data={group.points} fill={color(i)} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        <ChartNotes notes={data.notes} />
      </>
    )
  }

  if (spec.chartType === 'combo') {
    // y[0] is the bar on the left axis, every later y a line on the right, so
    // a rate and a headcount keep their own scales.
    const [barKey, ...lineKeys] = seriesKeys
    const notes =
      lineKeys.length === 0 ? [...data.notes, 'A combo chart wants two or more value columns; drawn as a plain bar chart.'] : data.notes
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={rows} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            {grid}
            {categoryAxis}
            <YAxis yAxisId="left" {...axisProps} axisLine={false} tickFormatter={(v: number | string) => formatAxisTick(v, format)} />
            {lineKeys.length > 0 && (
              <YAxis
                yAxisId="right"
                orientation="right"
                {...axisProps}
                axisLine={false}
                tickFormatter={(v: number | string) => formatAxisTick(v, format)}
              />
            )}
            {tooltip}
            <Legend verticalAlign="top" align="right" wrapperStyle={{ top: 0, fontSize: 12 }} />
            <Bar yAxisId="left" dataKey={barKey} name={label(barKey)} fill={color(0)} radius={[4, 4, 0, 0]} maxBarSize={40} />
            {lineKeys.map((key, i) => (
              <Line
                yAxisId="right"
                key={key}
                type="monotone"
                dataKey={key}
                name={label(key)}
                stroke={color(i + 1)}
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <ChartNotes notes={notes} />
      </>
    )
  }

  if (spec.chartType === 'line') {
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={rows} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
            {grid}
            {categoryAxis}
            {valueAxis}
            {tooltip}
            {legend}
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label(key)}
                stroke={color(i)}
                strokeWidth={2.5}
                dot={rows.length <= 24 ? { r: 3 } : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <ChartNotes notes={data.notes} />
      </>
    )
  }

  if (spec.chartType === 'area' || spec.chartType === 'stacked_area') {
    const stackId = spec.chartType === 'stacked_area' ? 'stack' : undefined
    return (
      <>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={rows} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
            <defs>
              {seriesKeys.map((key, i) => (
                <linearGradient key={key} id={`ai-area-${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color(i)} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={color(i)} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            {grid}
            {categoryAxis}
            {valueAxis}
            {tooltip}
            {legend}
            {seriesKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={label(key)}
                stackId={stackId}
                stroke={color(i)}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#ai-area-${gradientId}-${i})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <ChartNotes notes={data.notes} />
      </>
    )
  }

  // Bar family.
  const horizontal = spec.chartType === 'horizontal_bar'
  const stacked = spec.chartType === 'stacked_bar'
  return (
    <>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={rows}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={horizontal ? { top: 10, right: 24, left: 8, bottom: 0 } : { top: 20, right: 24, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.line} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                {...axisProps}
                allowDecimals={!wholeNumbers}
                tickFormatter={(v: number | string) => formatAxisTick(v, format)}
              />
              <YAxis type="category" dataKey={X_KEY} width={130} {...axisProps} tickFormatter={axisLabel} interval={0} />
            </>
          ) : (
            <>
              {categoryAxis}
              {valueAxis}
            </>
          )}
          {tooltip}
          {legend}
          {seriesKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={label(key)}
              stackId={stacked ? 'stack' : undefined}
              fill={color(i)}
              radius={stacked ? undefined : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartNotes notes={data.notes} />
    </>
  )
}

function useChartRows(spec: AiChartSpec) {
  const specKey = useMemo(() => specCacheKey(spec), [spec])
  return useQuery({
    queryKey: aiDashboardKeys.query(specKey),
    queryFn: () => runAiSql(spec.sql),
    staleTime: 5 * 60 * 1000,
    // A rejected statement is a permanent 400; retrying only delays the message.
    retry: false,
  })
}

function KpiCard({ spec, onRemove }: { spec: AiChartSpec; onRemove: () => void }) {
  const { data, isPending, error, refetch } = useChartRows(spec)
  const title = chartTitle(spec)
  const kpi = data ? buildEncodedChartData(data.columns, data.rows, spec.encoding) : null
  const first = kpi?.rows[0]?.[kpi.seriesKeys[0]]
  const problem = error ? sqlErrorMessage(error) : kpi?.fatal

  return (
    <section
      className="flex h-full min-w-0 flex-col gap-1.5 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4"
      data-testid="ai-dashboard-chart"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-ui-muted line-clamp-2">{title}</span>
        <IconButton label={`Remove ${title}`} icon={X} onClick={onRemove} className="-mr-2 -mt-1.5" />
      </div>
      {isPending ? (
        <span className="ai-shimmer h-8 w-24 rounded-lg" aria-label="Loading" />
      ) : problem ? (
        <div className="space-y-2">
          <p className="text-[13px] text-ui-danger">{problem}</p>
          <button type="button" onClick={() => void refetch()} className={btn({ variant: 'secondary', size: 'sm' })}>
            Try again
          </button>
        </div>
      ) : (
        <span className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-ui-text tabular-nums">
          {formatMeasure(typeof first === 'number' ? first : null, spec.valueFormat)}
        </span>
      )}
      <span className="mt-auto text-xs text-ui-muted">{chartSubtitle(spec)}</span>
    </section>
  )
}

export function AiChartCard({ spec, onRemove }: { spec: AiChartSpec; onRemove: () => void }) {
  if (spec.chartType === 'kpi') return <KpiCard spec={spec} onRemove={onRemove} />
  return <GraphCard spec={spec} onRemove={onRemove} />
}

function GraphCard({ spec, onRemove }: { spec: AiChartSpec; onRemove: () => void }) {
  const { data, isPending, error, refetch } = useChartRows(spec)
  const title = chartTitle(spec)

  return (
    <section
      className="flex h-full min-w-0 flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]"
      data-testid="ai-dashboard-chart"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ui-text line-clamp-2">{title}</h2>
          <p className="mt-0.5 text-[13px] text-ui-muted">{chartSubtitle(spec)}</p>
        </div>
        <IconButton label={`Remove ${title}`} icon={X} onClick={onRemove} className="-mr-2" />
      </header>
      <div className="min-w-0">
        {isPending ? (
          <div className="ai-shimmer rounded-[10px]" style={{ height: CHART_HEIGHT }} aria-label="Running the query" />
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 px-2" style={{ height: CHART_HEIGHT }}>
            <p className="flex w-full items-start gap-2 rounded-[10px] bg-ui-danger-soft p-3 text-[13px] text-ui-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-pre-line">{sqlErrorMessage(error)}</span>
            </p>
            <button type="button" onClick={() => void refetch()} className={btn({ variant: 'secondary', size: 'sm' })}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          </div>
        ) : (
          <>
            <ChartBody spec={spec} result={data} />
            {data.truncated && (
              <p className="mt-2 text-xs text-ui-muted">Showing the first {data.rows.length} rows; the result was truncated.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
