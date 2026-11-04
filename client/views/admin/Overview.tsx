'use client'

import { useMemo, type ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarClock,
  FileCheck2,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, EmptyState, PageHeader, Skeleton } from '@/components/kit'
import { AdminStat, BarList, ColumnChart, fmtDate, PanelHeader, Pill } from '@/components/admin/ui'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import {
  fetchAdminKpiStats,
  fetchCourseCompletionRates,
  fetchCourseEngagement,
  fetchEnrollmentTrend,
  fetchUserGrowthTrend,
  type TrendPoint,
} from '@/lib/api/adminAnalytics'
import { fetchNeedsAttention, type NeedsAttention } from '@/lib/api/redesign'
import { cn } from '@/lib/utils'

const QUICK_ACTIONS: { label: string; subtitle: string; href: string; icon: LucideIcon }[] = [
  { label: 'New course', subtitle: 'Build with modules and blocks', href: '/admin/courses', icon: BookOpen },
  { label: 'Analytics', subtitle: 'Platform-wide insights', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Live events', subtitle: 'Schedule and manage events', href: '/admin/live-events', icon: CalendarDays },
  { label: 'Offers', subtitle: 'Manage member offers', href: '/admin/offers', icon: Tag },
  { label: 'Invites', subtitle: 'Generate invite codes', href: '/admin/invites', icon: Link2 },
]

export default function AdminOverview() {
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: fetchAdminKpiStats })
  const { data: userGrowth, isLoading: growthLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'user-growth'],
    queryFn: () => fetchUserGrowthTrend(),
  })
  const { data: enrollmentTrend, isLoading: enrollLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'enrollments'],
    queryFn: fetchEnrollmentTrend,
  })
  const { data: courseEngagement = [], isLoading: engagementLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'course-engagement'],
    queryFn: fetchCourseEngagement,
  })
  const { data: courseCompletion = [], isLoading: completionLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'course-completion'],
    queryFn: () => fetchCourseCompletionRates(),
  })
  const attention = useQuery({
    queryKey: ['admin', 'needs-attention'],
    queryFn: fetchNeedsAttention,
    retry: false,
  })

  const growth = useMemo(() => lastTwelveMonths(userGrowth ?? []), [userGrowth])
  const enrollments = useMemo(() => lastTwelveMonths(enrollmentTrend ?? []), [enrollmentTrend])
  const engagement = useMemo(
    () =>
      [...courseEngagement]
        .sort((a, b) => b.activeLearners - a.activeLearners)
        .slice(0, 8)
        .map((c) => ({ label: c.label, value: c.activeLearners })),
    [courseEngagement],
  )
  const completion = useMemo(
    () =>
      [...courseCompletion]
        .filter((c) => c.totalEnrolled > 0)
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 8)
        .map((c) => ({ label: c.label, value: c.completionRate })),
    [courseCompletion],
  )
  const enrolledTotal = courseCompletion.reduce((n, c) => n + c.totalEnrolled, 0)
  const enrolledCourses = courseCompletion.filter((c) => c.totalEnrolled > 0).length
  const anyCompleted = courseCompletion.some((c) => c.completed > 0)

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0 max-md:flex-col max-md:items-start"
          title="Dashboard"
          subtitle={`Here is an overview of the platform. ${todayLabel()}.`}
          actions={
            <>
              <Pill tone="brand" className="self-center">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Super admin
              </Pill>
              <Link href="/admin/courses" className={btn()}>
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                New course
              </Link>
            </>
          }
        />

        <section
          aria-label="Key figures"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4"
        >
          <AdminStat icon={Users} label="Total members" value={stats ? stats.totalUsers : '-'} hint="Registered members" />
          <AdminStat icon={BookOpen} label="Active courses" value={stats ? stats.activeCourses : '-'} hint="Published" />
          <AdminStat icon={Award} label="Certificates issued" value={stats ? stats.certificatesIssued : '-'} hint="Active certificates" />
          <AdminStat icon={Sparkles} label="Active learners" value={stats ? stats.activeLearnersThisMonth : '-'} hint="This month" />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="h-quick" className="flex flex-col self-stretch rounded-[14px] border border-ui-line bg-ui-surface">
            <PanelHeader id="h-quick" title="Quick actions" />
            <div className="grid flex-1 grid-cols-2 border-t border-ui-line sm:grid-cols-3 xl:grid-cols-5">
              {QUICK_ACTIONS.map((q, i) => (
                <Link
                  key={q.label}
                  href={q.href}
                  className={cn(
                    'flex flex-col gap-2.5 px-[18px] py-4 text-ui-text transition-colors hover:bg-ui-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand',
                    // Rules between cells: top border from the second row on, left border inside a row.
                    'max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(even)]:border-l',
                    'sm:max-xl:[&:nth-child(n+4)]:border-t sm:max-xl:[&:not(:nth-child(3n+1))]:border-l',
                    i > 0 && 'xl:border-l',
                    'border-ui-line',
                  )}
                >
                  <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
                    <q.icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{q.label}</span>
                    <span className="text-xs text-ui-muted">{q.subtitle}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <NeedsAttentionPanel
            data={attention.data}
            loading={attention.isLoading}
            failed={attention.isError}
            onRetry={() => attention.refetch()}
            publishedCourses={stats?.activeCourses}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <AdminChartCard
            title="User registrations"
            subtitle="New members per month, last 12 months"
            aside={growthLoading ? undefined : sum(growth)}
          >
            {growthLoading ? (
              <Skeleton className="h-[210px]" />
            ) : (
              <ColumnChart data={growth} label={`New members per month, ${rangeLabel(growth)}`} />
            )}
          </AdminChartCard>
          <AdminChartCard
            title="Enrollments over time"
            subtitle="New course enrollments per month, last 12 months"
            aside={enrollLoading ? undefined : sum(enrollments)}
          >
            {enrollLoading ? (
              <Skeleton className="h-[210px]" />
            ) : (
              <ColumnChart data={enrollments} label={`Course enrollments per month, ${rangeLabel(enrollments)}`} />
            )}
          </AdminChartCard>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
          <AdminChartCard title="Course engagement" subtitle="Active learners per course this month, top 8">
            {engagementLoading ? (
              <Skeleton className="h-56" />
            ) : engagement.length === 0 ? (
              <EmptyState icon={Sparkles} title="No course activity yet" body="Courses appear here once learners start working through units." />
            ) : (
              <BarList data={engagement} className="pt-0.5" />
            )}
          </AdminChartCard>
          <AdminChartCard title="Course completion rate" subtitle="Share of enrollees who completed each course">
            {completionLoading ? (
              <Skeleton className="h-56" />
            ) : !anyCompleted ? (
              <EmptyState
                icon={FileCheck2}
                className="py-8"
                title="No completions yet"
                body={
                  enrolledTotal > 0
                    ? `${enrolledTotal} ${plural(enrolledTotal, 'enrollment')} across ${enrolledCourses} ${plural(enrolledCourses, 'course')}, none completed so far. Rates appear here as learners finish their courses.`
                    : 'No enrollments yet. Rates appear here as learners finish their courses.'
                }
                action={
                  <Link href="/admin/analytics" className={btn({ variant: 'secondary', size: 'sm' })}>
                    Open course performance
                  </Link>
                }
              />
            ) : (
              <BarList data={completion} max={100} format={(v) => `${Math.round(v)}%`} className="pt-0.5" />
            )}
          </AdminChartCard>
        </div>
      </div>
    </AdminLayout>
  )
}

// ── Needs attention ──────────────────────────────────────────────────────────

type AttentionRow = {
  key: string
  icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>
  title: string
  detail: string
  count: number
  href?: string
}

function NeedsAttentionPanel({
  data,
  loading,
  failed,
  onRetry,
  publishedCourses,
}: {
  data?: NeedsAttention
  loading: boolean
  failed: boolean
  onRetry: () => void
  publishedCourses?: number
}) {
  const rows: AttentionRow[] = data
    ? [
        {
          key: 'mentor',
          icon: UserCheck,
          title: 'Mentor applications to review',
          detail:
            data.pendingMentorApplications > 0
              ? `${data.pendingMentorApplications} waiting for a decision`
              : 'No applications waiting for review',
          count: data.pendingMentorApplications,
          href: '/admin/applications',
        },
        {
          key: 'stakeholder',
          icon: Building2,
          title: 'Stakeholder applications',
          detail:
            data.pendingStakeholderApplications > 0
              ? `${data.pendingStakeholderApplications} received in the last 30 days`
              : 'None received in the last 30 days',
          count: data.pendingStakeholderApplications,
          href: '/admin/stakeholder-applications/vc',
        },
        {
          key: 'drafts',
          icon: Pencil,
          title: 'Draft courses',
          detail:
            data.draftCourses > 0
              ? `${data.draftCourses} ${plural(data.draftCourses, 'course')} not published yet`
              : publishedCourses !== undefined
                ? `All ${publishedCourses} courses are published`
                : 'Every course is published',
          count: data.draftCourses,
          href: '/admin/courses',
        },
        {
          key: 'invites',
          icon: Link2,
          title: 'Unused invite codes',
          detail:
            data.unusedInviteCodes.length > 0
              ? data.unusedInviteCodes
                  .slice(0, 2)
                  .map((c) => `${c.code}, created ${fmtDate(c.createdAt)}`)
                  .join('; ') + (data.unusedInviteCodes.length > 2 ? ` and ${data.unusedInviteCodes.length - 2} more` : '')
              : 'Every invite code has been used',
          count: data.unusedInviteCodes.length,
          href: '/admin/invites',
        },
        {
          key: 'sessions',
          icon: CalendarClock,
          title: 'Mentor sessions to complete',
          detail:
            data.mentorSessionsNeedingCompletion > 0
              ? 'Ended but not yet marked complete by the mentor'
              : 'Every past session has been closed',
          count: data.mentorSessionsNeedingCompletion,
        },
      ]
    : []

  return (
    <section aria-labelledby="h-att" className="rounded-[14px] border border-ui-line bg-ui-surface">
      <PanelHeader id="h-att" title="Needs attention" />
      {loading ? (
        <div className="space-y-2 border-t border-ui-line px-5 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : failed || !data ? (
        <div className="flex flex-col items-start gap-2 border-t border-ui-line px-5 py-4">
          <p className="text-[13px] text-ui-muted">Could not load the items that need attention.</p>
          <button type="button" onClick={onRetry} className={btn({ variant: 'secondary', size: 'sm' })}>
            Try again
          </button>
        </div>
      ) : (
        <ul>
          {rows.map((r) => {
            const inner = (
              <>
                <r.icon className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-ui-text">{r.title}</span>
                  <span className="truncate text-xs text-ui-muted" title={r.detail}>
                    {r.detail}
                  </span>
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', r.count > 0 ? 'text-ui-brand-text' : 'text-ui-muted')}>
                  {r.count}
                </span>
              </>
            )
            const cls = 'grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-t border-ui-line px-5 py-2.5'
            return (
              <li key={r.key}>
                {r.href ? (
                  <Link
                    href={r.href}
                    className={cn(cls, 'transition-colors hover:bg-ui-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand')}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The trend APIs return only months that have data, labelled like "Jun '26".
 * Spread them over the last 12 calendar months so empty months show as gaps.
 */
function lastTwelveMonths(points: TrendPoint[]) {
  const counts = new Map<string, number>()
  for (const p of points) {
    const m = /^([A-Za-z]{3})\w*\s*'?(\d{2,4})?/.exec(p.label.trim())
    if (!m) continue
    const month = MONTHS.indexOf(m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase())
    if (month < 0) continue
    const year = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : new Date().getFullYear()
    counts.set(`${year}-${month}`, (counts.get(`${year}-${month}`) ?? 0) + p.count)
  }
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return { label: MONTHS[d.getMonth()], value: counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0, year: d.getFullYear() }
  })
}

function rangeLabel(series: { label: string; year: number }[]) {
  if (series.length === 0) return 'last 12 months'
  const a = series[0]
  const b = series[series.length - 1]
  return `${a.label} ${a.year} to ${b.label} ${b.year}`
}

function sum(series: { value: number }[]) {
  return series.reduce((n, p) => n + p.value, 0)
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`
}

function todayLabel() {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  return `${weekday}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}
