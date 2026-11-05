'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Landmark, TrendingUp, UserCheck, type LucideIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Skeleton } from '@/components/kit'
import { BarList, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { useResolvedColors } from '@/components/admin/analytics/charts'
import { RANGE_WORDS, countAxisMax, fillSeries, isMonthly } from '@/components/admin/analytics/trend'
import { fetchStakeholderKpis, fetchStakeholderTrendByType } from '@/lib/api/adminAnalytics'
import type { AnalyticsRange } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

// Hadafi takes experts, supporters (the 'vc' type) and government. Corporate,
// university and incubator applications are switched off for now.
type TypeKey = 'expert' | 'vc' | 'government'

const TYPE_CONFIG: { key: TypeKey; label: string; icon: LucideIcon; href: string }[] = [
  { key: 'expert', label: 'Expert', icon: UserCheck, href: '/admin/applications' },
  { key: 'vc', label: 'Supporter', icon: TrendingUp, href: '/admin/stakeholder-applications/vc' },
  { key: 'government', label: 'Government', icon: Landmark, href: '/admin/stakeholder-applications/government' },
]

const LINE_KEYS = TYPE_CONFIG.map((t) => t.key)

interface Props {
  range: AnalyticsRange
}

export function AnalyticsStakeholdersTab({ range }: Props) {
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'stakeholder-kpis'],
    queryFn: fetchStakeholderKpis,
  })

  const { data: trend = [], isLoading: trendLoading, isError: trendError } = useQuery({
    queryKey: ['admin', 'analytics', 'stakeholder-trend-by-type', range],
    queryFn: () => fetchStakeholderTrendByType(range),
  })

  const series = useMemo(() => fillSeries(range, trend, LINE_KEYS), [range, trend])
  const totals = useMemo(
    () => Object.fromEntries(LINE_KEYS.map((k) => [k, series.reduce((s, p) => s + p[k], 0)])) as Record<TypeKey, number>,
    [series],
  )
  const active = TYPE_CONFIG.filter((t) => totals[t.key] > 0)
  const quiet = TYPE_CONFIG.filter((t) => totals[t.key] === 0)
  const yMax = countAxisMax(Math.max(0, ...series.flatMap((p) => LINE_KEYS.map((k) => p[k]))))

  const colors = useResolvedColors({
    brand: chartColors.brand,
    muted: chartColors.muted,
    line: chartColors.line,
    text: chartColors.text,
    surface: chartColors.surface,
    s1: chartColors.series[1],
    s2: chartColors.series[2],
    s3: chartColors.series[3],
    s4: chartColors.series[4],
    s5: chartColors.series[5],
  })
  const palette = [colors.brand, colors.s1, colors.s2, colors.s3, colors.s4, colors.s5]
  const colorFor = (k: TypeKey) => {
    const i = active.findIndex((t) => t.key === k)
    return i >= 0 ? palette[i % palette.length] : colors.muted
  }

  const distributionData = TYPE_CONFIG.map((t) => ({ label: t.label, value: kpis?.[t.key] ?? 0 }))
  const total = distributionData.reduce((s, d) => s + d.value, 0)
  // Thin the x-axis labels: every label up to 12 points (every other on phones), else every 5th (10th).
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const tickEvery = series.length <= 12 ? (narrow ? 1 : 0) : narrow ? 9 : 4

  return (
    <section aria-labelledby="h-stake" className="flex flex-col gap-4">
      <div>
        <h2 id="h-stake" className="text-lg font-semibold text-ui-text">Stakeholder applications</h2>
        <p className="mt-0.5 text-sm text-ui-muted">Experts, supporters and government bodies who applied to join.</p>
      </div>

      {/* Counts by type, each opens its applications list */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[420px]:grid-cols-3">
        {TYPE_CONFIG.map((t) => {
          const value = kpis?.[t.key] ?? 0
          const Icon = t.icon
          return (
            <Link
              key={t.key}
              href={t.href}
              className="flex flex-col gap-1.5 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4 transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-ui-muted">
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {t.label}
              </span>
              <span className={cn('text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums', value > 0 ? 'text-ui-text' : 'text-ui-muted')}>
                {kpisLoading ? <span aria-hidden className="inline-block h-7 w-8 animate-pulse rounded-md bg-ui-surface-2 align-middle" /> : value.toLocaleString()}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Registrations over time */}
        <Card className="flex flex-col gap-2.5 px-5 py-[18px]">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ui-text">Registrations over time</h3>
              <p className="mt-0.5 text-[13px] text-ui-muted">
                New applications per {isMonthly(range) ? 'month' : 'day'}, {RANGE_WORDS[range]}
              </p>
            </div>
            <ul aria-label="Legend" className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ui-muted">
              {active.map((t) => (
                <li key={t.key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-[3px] w-3 rounded-sm" style={{ background: colorFor(t.key) }} />
                  {t.label}
                </li>
              ))}
              {quiet.length > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-3 border-t-2 border-dashed border-ui-muted" />
                  {quiet.map((t) => t.label).join(', ')}
                </li>
              )}
            </ul>
          </div>
          {trendLoading ? (
            <Skeleton className="h-[220px]" />
          ) : trendError ? (
            <p className="py-16 text-center text-sm text-ui-muted">Could not load registrations.</p>
          ) : (
            <div className="h-[220px]" role="img" aria-label={`Stakeholder applications per ${isMonthly(range) ? 'month' : 'day'} by type`}>
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="short"
                    stroke={colors.line}
                    tick={{ fill: colors.muted, fontSize: 11 }}
                    tickLine={false}
                    interval={tickEvery}
                    padding={{ left: 8, right: 8 }}
                    minTickGap={4}
                  />
                  <YAxis
                    width={28}
                    tick={{ fill: colors.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    domain={[0, yMax]}
                    ticks={[0, yMax / 2, yMax]}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    cursor={{ stroke: colors.line }}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ''}
                  />
                  {/* Quiet (all-zero) types first so active lines draw on top */}
                  {[...quiet, ...active].map((t) => {
                    const isActive = totals[t.key] > 0
                    const peak = Math.max(...series.map((p) => p[t.key]))
                    const peakIndex = series.findIndex((p) => p[t.key] === peak)
                    const color = colorFor(t.key)
                    return (
                      <Line
                        key={t.key}
                        type="linear"
                        dataKey={t.key}
                        name={t.label}
                        stroke={color}
                        strokeWidth={isActive ? 2 : 1.5}
                        strokeDasharray={isActive ? undefined : '4 3'}
                        isAnimationActive={false}
                        activeDot={isActive ? { r: 4, fill: color, stroke: colors.surface, strokeWidth: 2 } : false}
                        dot={(props: { cx?: number; cy?: number; index?: number }) => {
                          const { cx, cy, index } = props
                          if (!isActive || index !== peakIndex || cx == null || cy == null) return <g key={`${t.key}-${index}`} />
                          return (
                            <g key={`${t.key}-${index}`}>
                              <circle cx={cx} cy={cy} r={4} fill={color} stroke={colors.surface} strokeWidth={2} />
                              <text x={cx} y={cy - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill={colors.text}>
                                {peak}
                              </text>
                            </g>
                          )
                        }}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {!trendLoading && !trendError && active.length === 0 && (
            <p className="text-[13px] text-ui-muted">No applications in the {RANGE_WORDS[range]}.</p>
          )}
        </Card>

        {/* Distribution by type */}
        <Card className="flex flex-col gap-4 px-5 py-[18px]">
          <div>
            <h3 className="text-base font-semibold text-ui-text">Distribution by type</h3>
            <p className="mt-0.5 text-[13px] text-ui-muted">
              All time, {total.toLocaleString()} {total === 1 ? 'application' : 'applications'}
            </p>
          </div>
          {kpisLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-4" />)}
            </div>
          ) : (
            <BarList data={distributionData} max={Math.max(1, ...distributionData.map((d) => d.value))} />
          )}
        </Card>
      </div>
    </section>
  )
}
