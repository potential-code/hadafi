'use client'

/**
 * The admin home's impact view (ported from SMEEP 9c89f63): live platform
 * figures and outcome charts from GET /api/admin/analytics/impact. Every
 * number is counted from the database; nothing is hard-coded.
 */
import type { LucideIcon } from 'lucide-react'
import { Award, BookOpenCheck, CalendarCheck, FileCheck2, Globe2, GraduationCap, Sparkles, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, Skeleton } from '@/components/kit'
import { BarList, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { useResolvedColors } from '@/components/admin/analytics/charts'
import type { Impact } from '@/lib/api/adminReports'
import { cn } from '@/lib/utils'

const fmt = (n: number) => n.toLocaleString('en-US')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m

export const TILE_TONES = {
  brand: 'bg-ui-brand-soft text-ui-brand-text',
  blue: 'bg-[#e8f0f8] text-[#1d4e89] dark:bg-[#1b2836] dark:text-[#8fb8e6]',
  green: 'bg-[#e3f1ec] text-[#1f6f5c] dark:bg-[#16302a] dark:text-[#7fd1b6]',
  amber: 'bg-[#fcf0e2] text-[#8a4513] dark:bg-[#3a2a17] dark:text-[#f0b26b]',
  violet: 'bg-[#efe8f6] text-[#4c1d6e] dark:bg-[#2c2140] dark:text-[#c8a8ee]',
} as const

export function useChartPalette() {
  return useResolvedColors({
    s0: chartColors.series[0],
    s1: chartColors.series[1],
    s2: chartColors.series[2],
    muted: chartColors.muted,
    line: chartColors.line,
  })
}

export function ImpactSection({ impact, loading, publishedCourses }: { impact?: Impact; loading: boolean; publishedCourses?: number }) {
  const c = useChartPalette()
  const s = impact?.summary
  const tiles: { icon: LucideIcon; label: string; value: string; hint: string; tone: keyof typeof TILE_TONES }[] = s
    ? [
        { icon: Users, label: 'Learners', value: fmt(s.learners), hint: `+${fmt(s.newLearners30d)} in the last 30 days`, tone: 'brand' },
        { icon: Sparkles, label: 'Active learners', value: fmt(s.activeLearners30d), hint: 'Learned in the last 30 days', tone: 'blue' },
        { icon: Globe2, label: 'Countries', value: fmt(s.countries), hint: 'Where learners are based', tone: 'green' },
        { icon: BookOpenCheck, label: 'Lessons completed', value: fmt(s.lessonsCompleted), hint: `${fmt(s.enrolments)} course enrolments`, tone: 'amber' },
        { icon: GraduationCap, label: 'Courses completed', value: fmt(s.coursesCompleted), hint: 'Every unit finished', tone: 'violet' },
        { icon: Award, label: 'Certificates', value: fmt(s.certificates), hint: 'Earned by passing final exams', tone: 'brand' },
        { icon: CalendarCheck, label: 'Mentor sessions', value: fmt(s.mentorSessions), hint: 'Booked with expert mentors', tone: 'blue' },
        {
          icon: FileCheck2,
          label: 'Final exams taken',
          value: fmt(s.finalExams),
          hint: s.finalExamAvgScore == null ? 'Scores show once learners sit them' : `Average score ${s.finalExamAvgScore}%`,
          tone: 'green',
        },
      ]
    : []

  const monthly = (impact?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) }))
  const hasActivity = monthly.some((m) => m.activeLearners > 0 || m.lessonsCompleted > 0)
  const hasOutcomes = monthly.some((m) => m.coursesCompleted > 0 || m.certificates > 0)
  const axis = { fontSize: 11, fill: c.muted }

  return (
    <section aria-labelledby="h-impact" className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#8f0b4c,#b00e5e_50%,#c8106a)] px-6 py-6 text-white sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-white/[0.07]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[520px] flex-col gap-1.5">
            <h2 id="h-impact" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white">
              Impact
            </h2>
            <p className="text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">
              Helping women entrepreneurs learn, grow and succeed
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {(
              [
                [s ? fmt(s.learners) : null, 'learners'],
                [s ? fmt(s.countries) : null, s?.countries === 1 ? 'country' : 'countries'],
                [publishedCourses !== undefined ? fmt(publishedCourses) : null, 'published courses'],
              ] as const
            ).map(([value, label]) => (
              <div key={label} className="flex flex-col">
                <dt className="order-2 text-[13px] text-white">{label}</dt>
                <dd className="order-1 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                  {value ?? <span aria-hidden className="inline-block h-[30px] w-12 animate-pulse rounded-md bg-white/20 align-middle" />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4" aria-label="On the platform" role="group">
        {loading || !s
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[112px] rounded-[14px]" />)
          : tiles.map((t) => <ImpactTile key={t.label} {...t} />)}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <AdminChartCard title="Learning activity" subtitle="Active learners and lessons completed per month">
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : !hasActivity ? (
            <EmptyState icon={Sparkles} title="Learning activity shows here" body="This fills in as learners work through lessons." />
          ) : (
            <div className="h-[220px]" role="img" aria-label="Active learners and lessons completed per month, last 12 months">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="impact-lessons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.s0} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={c.s0} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="impact-active" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.s1} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} cursor={{ stroke: c.line }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="lessonsCompleted" name="Lessons completed" stroke={c.s0} strokeWidth={2} fill="url(#impact-lessons)" />
                  <Area type="monotone" dataKey="activeLearners" name="Active learners" stroke={c.s1} strokeWidth={2} fill="url(#impact-active)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Outcomes" subtitle="Courses completed and certificates earned per month">
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : !hasOutcomes ? (
            <EmptyState icon={Award} title="Completions show here" body="Completed courses and certificates appear month by month." />
          ) : (
            <div className="h-[220px]" role="img" aria-label="Courses completed and certificates per month, last 12 months">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="coursesCompleted" name="Courses completed" fill={c.s0} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="certificates" name="Certificates" fill={c.s2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="What learners use" subtitle="Learners who have used each part of Hadafi">
          {loading ? <Skeleton className="h-56" /> : <BarList data={(impact?.uses ?? []).map((u) => ({ label: u.label, value: u.learners }))} />}
        </AdminChartCard>

        <AdminChartCard title="Where learners are" subtitle="Learners by country, top 8">
          {loading ? (
            <Skeleton className="h-56" />
          ) : (impact?.countries.length ?? 0) === 0 ? (
            <EmptyState icon={Globe2} title="Countries show here" body="Learners pick their country when they sign up." />
          ) : (
            <BarList data={(impact?.countries ?? []).map((x) => ({ label: x.country, value: x.learners }))} />
          )}
        </AdminChartCard>
      </div>
    </section>
  )
}

function ImpactTile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: keyof typeof TILE_TONES }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4">
      <span className="flex items-center gap-2.5">
        <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', TILE_TONES[tone])}>
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
        </span>
        <span className="min-w-0 text-[13px] font-medium text-ui-muted">{label}</span>
      </span>
      <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">{value}</span>
      <span className="text-xs text-ui-muted">{hint}</span>
    </div>
  )
}
