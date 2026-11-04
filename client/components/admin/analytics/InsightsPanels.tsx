'use client'

/**
 * Analytics highlights (ported from SMEEP 09045cd): KPI tiles with the change
 * against the previous period, then activity, funnel, mix, mentor sessions,
 * final exam scores, weekdays and countries. Data: GET /api/admin/analytics/insights.
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  FileCheck2,
  Globe2,
  GraduationCap,
  Minus,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, Skeleton } from '@/components/kit'
import { BarList, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { RANGE_WORDS } from '@/components/admin/analytics/trend'
import { useResolvedColors } from '@/components/admin/analytics/charts'
import { TILE_TONES } from '@/components/admin/ImpactSection'
import type { AnalyticsRange } from '@/lib/api/adminAnalytics'
import type { AnalyticsInsights, KpiDelta } from '@/lib/api/adminReports'
import { cn } from '@/lib/utils'

const fmt = (n: number) => n.toLocaleString('en-US')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Buckets are UTC dates from the server: "2026-10" or "2026-10-05". */
function bucketLabel(bucket: string, range: AnalyticsRange) {
  const month = MONTHS[Number(bucket.slice(5, 7)) - 1] ?? bucket
  return range === '12m' ? month : `${Number(bucket.slice(8, 10))} ${month}`
}

const PERIOD: Record<AnalyticsRange, string> = { '7d': 'previous 7 days', '30d': 'previous 30 days', '12m': 'previous 12 months' }

// ── Highlight KPIs ───────────────────────────────────────────────────────────

/** "+12% vs previous 30 days", or a plain word when there is nothing to compare with. */
export function Change({ delta, range }: { delta: KpiDelta; range: AnalyticsRange }) {
  const { current, previous } = delta
  if (current === 0 && previous === 0) return <span className="text-xs text-ui-muted">Nothing to compare yet</span>
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ui-ok">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        New this period
      </span>
    )
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 text-xs font-semibold', pct > 0 ? 'text-ui-ok' : pct < 0 ? 'text-ui-danger' : 'text-ui-muted')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {pct > 0 ? '+' : ''}
      {pct}% <span className="font-normal text-ui-muted">vs {PERIOD[range]}</span>
    </span>
  )
}

export function HighlightKpis({ data, loading, range }: { data?: AnalyticsInsights; loading: boolean; range: AnalyticsRange }) {
  const k = data?.kpis
  const tiles: { icon: LucideIcon; label: string; delta?: KpiDelta; tone: keyof typeof TILE_TONES; extra?: ReactNode }[] = [
    { icon: UserPlus, label: 'New learners', delta: k?.newLearners, tone: 'brand' },
    { icon: Sparkles, label: 'Active learners', delta: k?.activeLearners, tone: 'blue' },
    { icon: BookOpen, label: 'Course enrolments', delta: k?.enrolments, tone: 'violet' },
    { icon: BookOpenCheck, label: 'Lessons completed', delta: k?.lessonsCompleted, tone: 'amber' },
    { icon: GraduationCap, label: 'Courses completed', delta: k?.coursesCompleted, tone: 'green' },
    { icon: Award, label: 'Certificates', delta: k?.certificates, tone: 'brand' },
    { icon: CalendarCheck, label: 'Mentor sessions', delta: k?.mentorSessions, tone: 'blue' },
    {
      icon: FileCheck2,
      label: 'Final exams taken',
      delta: k?.finalExams,
      tone: 'green',
      extra: k?.finalExamAvgScore != null ? <span className="text-xs text-ui-muted">Average {k.finalExamAvgScore}%</span> : null,
    },
  ]
  return (
    <section
      aria-label={`Highlights, ${RANGE_WORDS[range]}`}
      className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4"
    >
      {tiles.map((t) =>
        loading || !t.delta ? (
          <Skeleton key={t.label} className="h-[118px] rounded-[14px]" />
        ) : (
          <div key={t.label} className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4">
            <span className="flex items-center gap-2.5">
              <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', TILE_TONES[t.tone])}>
                <t.icon className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0 text-[13px] font-medium text-ui-muted">{t.label}</span>
            </span>
            <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">{fmt(t.delta.current)}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Change delta={t.delta} range={range} />
              {t.extra}
            </span>
          </div>
        ),
      )}
    </section>
  )
}

// ── Charts ───────────────────────────────────────────────────────────────────

export function InsightsCharts({ data, loading, range }: { data?: AnalyticsInsights; loading: boolean; range: AnalyticsRange }) {
  const c = useResolvedColors({
    s0: chartColors.series[0],
    s1: chartColors.series[1],
    s2: chartColors.series[2],
    s3: chartColors.series[3],
    s4: chartColors.series[4],
    muted: chartColors.muted,
    line: chartColors.line,
    brand: chartColors.brand,
  })
  const palette = [c.s0, c.s1, c.s2, c.s3, c.s4]
  const axis = { fontSize: 11, fill: c.muted }
  const series = (data?.series ?? []).map((s) => ({ ...s, label: bucketLabel(s.bucket, range) }))
  const per = range === '12m' ? 'month' : 'day'
  const hasActivity = series.some((s) => s.activeLearners || s.lessonsCompleted)
  const hasSessions = series.some((s) => s.sessionsBooked || s.sessionsCancelled)
  const mix = (data?.activityMix ?? []).filter((m) => m.count > 0)
  const mixTotal = mix.reduce((n, m) => n + m.count, 0)
  const exams = data?.examScores ?? []
  const hasExams = exams.some((e) => e.attempts > 0)
  const funnelTop = data?.funnel[0]?.learners ?? 0

  const sk = (h = 'h-[230px]') => <Skeleton className={h} />

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <AdminChartCard title="Learning activity" subtitle={`Active learners and lessons completed per ${per}, ${RANGE_WORDS[range]}`}>
          {loading ? (
            sk()
          ) : !hasActivity ? (
            <EmptyState icon={Sparkles} title="Learning activity shows here" body="This fills in as learners work through lessons." />
          ) : (
            <div className="h-[230px]" role="img" aria-label={`Active learners and lessons completed per ${per}, ${RANGE_WORDS[range]}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ins-lessons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.s0} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={c.s0} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ins-active" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.s1} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} cursor={{ stroke: c.line }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="lessonsCompleted" name="Lessons completed" stroke={c.s0} strokeWidth={2} fill="url(#ins-lessons)" />
                  <Area type="monotone" dataKey="activeLearners" name="Active learners" stroke={c.s1} strokeWidth={2} fill="url(#ins-active)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Learner funnel" subtitle="How far learners get, all time">
          {loading ? (
            sk()
          ) : (
            <ol className="flex flex-col gap-2.5" aria-label="Learner funnel">
              {(data?.funnel ?? []).map((f, i) => {
                const pct = funnelTop ? Math.round((f.learners / funnelTop) * 100) : 0
                return (
                  <li key={f.step} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 text-ui-text">{f.step}</span>
                      <span className="shrink-0 tabular-nums">
                        <strong className="font-semibold text-ui-text">{fmt(f.learners)}</strong>
                        {i > 0 && <span className="ms-1.5 text-ui-muted">{pct}%</span>}
                      </span>
                    </span>
                    <span aria-hidden className="h-3 overflow-hidden rounded-full bg-ui-surface-2">
                      <span
                        className="block h-full rounded-full bg-ui-brand"
                        style={{ width: `${Math.max(pct, f.learners ? 3 : 0)}%`, opacity: 1 - i * 0.14 }}
                      />
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </AdminChartCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <AdminChartCard title="Activity mix" subtitle={`What learners started, ${RANGE_WORDS[range]}`} aside={loading ? undefined : fmt(mixTotal)}>
          {loading ? (
            sk()
          ) : mix.length === 0 ? (
            <EmptyState icon={BookOpen} title="Activity shows here" body="Enrolments, exams, mentor sessions and offers appear as learners start them." />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="mx-auto h-[200px] w-[200px]" role="img" aria-label="Share of each activity">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="count" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                      {mix.map((m, i) => (
                        <Cell key={m.label} fill={palette[i % palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-col gap-2 text-[13px]">
                {mix.map((m, i) => (
                  <li key={m.label} className="flex items-center gap-2.5">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: palette[i % palette.length] }} />
                    <span className="min-w-0 flex-1 text-ui-text">{m.label}</span>
                    <span className="tabular-nums font-semibold text-ui-text">{fmt(m.count)}</span>
                    <span className="w-10 text-right tabular-nums text-ui-muted">{Math.round((m.count / mixTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Mentor sessions" subtitle={`Booked, completed and cancelled per ${per}`}>
          {loading ? (
            sk()
          ) : !hasSessions ? (
            <EmptyState icon={CalendarCheck} title="Sessions show here" body="Bookings with expert mentors appear as learners make them." />
          ) : (
            <div className="h-[230px]" role="img" aria-label={`Mentor sessions booked, completed and cancelled per ${per}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sessionsBooked" name="Booked" fill={c.s0} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sessionsCompleted" name="Completed" fill={c.s2} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sessionsCancelled" name="Cancelled" fill={c.muted} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
        <AdminChartCard
          title="Final exam scores"
          subtitle={`Attempts by score, ${RANGE_WORDS[range]}`}
          aside={loading || data?.examPassRate == null ? undefined : `${data.examPassRate}%`}
        >
          {loading ? (
            sk('h-[200px]')
          ) : !hasExams ? (
            <EmptyState icon={FileCheck2} title="Scores show here" body="Final exam results appear as learners finish their courses." />
          ) : (
            <>
              <div className="h-[170px]" role="img" aria-label="Final exam attempts by score band">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exams} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="band" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="attempts" name="Attempts" radius={[4, 4, 0, 0]}>
                      {exams.map((e, i) => (
                        <Cell key={e.band} fill={c.brand} fillOpacity={0.35 + i * 0.2} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data?.examPassRate != null && <p className="mt-2 text-xs text-ui-muted">{data.examPassRate}% of attempts passed</p>}
            </>
          )}
        </AdminChartCard>

        <AdminChartCard title="When learners learn" subtitle={`Active learners by weekday, ${RANGE_WORDS[range]}`}>
          {loading ? (
            sk('h-[200px]')
          ) : (
            <div className="h-[200px]" role="img" aria-label="Active learners by weekday">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.weekdays ?? []} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="activeLearners" name="Active learners" fill={c.s1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Learners by country" subtitle="All time, top 10">
          {loading ? (
            sk('h-[200px]')
          ) : (data?.countries.length ?? 0) === 0 ? (
            <EmptyState icon={Globe2} title="Countries show here" body="Learners pick their country when they sign up." />
          ) : (
            <BarList data={(data?.countries ?? []).map((x) => ({ label: x.country, value: x.learners }))} />
          )}
        </AdminChartCard>
      </div>
    </>
  )
}
