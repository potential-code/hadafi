'use client'

/**
 * One organisation's participants at a glance: headline numbers, sign-ups by
 * week, learning gain, courses and every participant. Partner contacts see it
 * as their dashboard; admins see it on the organisation's page (with their own
 * actions on each participant). Ported from SMEEP db40881 / 68d8fd4.
 */
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Award, BookOpenCheck, CalendarCheck2, Check, Copy, GraduationCap, TrendingUp, UserCheck, Users } from 'lucide-react'
import { Avatar, Card, EmptyState, ProgressBar, StatCard, btn, inputClass } from '@/components/kit'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { ColumnChart, SearchInput, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { LearningGainCard } from '@/components/admin/LearningGainCard'
import type { OrganisationDashboardData, OrganisationLearner } from '@/lib/api/organisations'
import { cn } from '@/lib/utils'

const nf = new Intl.NumberFormat('en-US')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "28 Sep": short enough for 12 columns side by side. */
const weekLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function lastSeen(iso: string | null): string {
  if (!iso) return 'Not yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return fmtDate(iso)
}

export function OrganisationDashboard({
  data,
  learnerAction,
  emptyLearners,
  learnerHref,
}: {
  data: OrganisationDashboardData
  /** Where a participant's full record opens. */
  learnerHref?: (l: OrganisationLearner) => string
  /** Shown at the end of each participant row (admins: remove from the organisation). */
  learnerAction?: (l: OrganisationLearner) => ReactNode
  /** What to show when nobody has joined yet (e.g. the sign-up link). */
  emptyLearners?: ReactNode
}) {
  const { kpis } = data
  const [q, setQ] = useState('')
  const learners = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data.learners
    return data.learners.filter((l) => [l.fullName, l.email, l.company ?? ''].some((v) => v.toLowerCase().includes(needle)))
  }, [data.learners, q])
  const pct = (n: number) => (kpis.learners ? Math.round((n / kpis.learners) * 100) : 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Participants" icon={Users} value={nf.format(kpis.learners)} hint="Joined with the link or added by Hadafi" />
        <StatCard
          label="Active, last 30 days"
          icon={UserCheck}
          value={nf.format(kpis.activeLearners)}
          hint={kpis.learners ? `${pct(kpis.activeLearners)}% of participants` : undefined}
        />
        <StatCard
          label="Learning"
          icon={GraduationCap}
          value={nf.format(kpis.learning)}
          hint={kpis.avgProgress != null ? `Average progress ${kpis.avgProgress}%` : 'Started at least one course'}
        />
        <StatCard label="Courses completed" icon={BookOpenCheck} value={nf.format(kpis.coursesCompleted)} />
        <StatCard label="Certificates" icon={Award} value={nf.format(kpis.certificates)} />
        <StatCard label="Mentor sessions" icon={CalendarCheck2} value={nf.format(kpis.mentorSessions)} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
        <AdminChartCard title="New participants" subtitle="Sign-ups each week, last 12 weeks">
          <ColumnChart
            label={`New participants per week: ${data.joinsByWeek.map((w) => `${weekLabel(w.week)} ${w.joins}`).join(', ')}`}
            data={data.joinsByWeek.map((w) => ({ label: weekLabel(w.week), value: w.joins }))}
          />
        </AdminChartCard>
        <LearningGainCard data={data.learningGain} maxCourses={4} />
      </div>

      <TableCard
        header={
          <div className="flex items-center gap-2 border-b border-ui-line px-5 py-4">
            <TrendingUp className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
            <h2 className="text-base font-semibold text-ui-text">Courses</h2>
          </div>
        }
      >
        {data.courses.length ? (
          <table className={cn(adminTableClass, 'min-w-[560px]')}>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col" className="!text-right">Participants</th>
                <th scope="col" className="!text-right">Completed</th>
                <th scope="col" className="w-[220px]">Average progress</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.courseId}>
                  <td className="font-medium text-ui-text">{c.title}</td>
                  <td className="text-right tabular-nums">{c.enrolled}</td>
                  <td className="text-right tabular-nums">{c.completed}</td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar value={c.avgProgress} className="flex-1" label={`${c.title} average progress`} />
                      <span className="w-9 text-right text-[13px] tabular-nums text-ui-muted">{c.avgProgress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={GraduationCap} title="No courses started yet" body="Courses appear here once participants start one." />
        )}
      </TableCard>

      <TableCard
        header={
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-line px-5 py-4">
            <h2 className="text-base font-semibold text-ui-text">
              Participants <span className="font-normal text-ui-muted">({nf.format(data.learners.length)})</span>
            </h2>
            {data.learners.length > 0 && (
              <SearchInput value={q} onChange={setQ} placeholder="Search name, email or company" className="w-full sm:w-[280px]" />
            )}
          </div>
        }
      >
        {data.learners.length === 0 ? (
          (emptyLearners ?? <EmptyState icon={Users} title="No participants yet" body="Participants appear here as soon as they join." />)
        ) : learners.length === 0 ? (
          <EmptyState title="No participants match" body="Try another name, email or company." />
        ) : (
          <table className={cn(adminTableClass, 'min-w-[880px]')}>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Company</th>
                <th scope="col">Joined</th>
                <th scope="col">Last active</th>
                <th scope="col" className="!text-right">Courses</th>
                <th scope="col" className="!text-right">Certificates</th>
                <th scope="col" className="!text-right">Sessions</th>
                <th scope="col" className="w-[160px]">Progress</th>
                {learnerAction && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="flex min-w-[200px] items-center gap-2.5">
                      <Avatar name={l.fullName} size={32} />
                      <div className="min-w-0">
                        {learnerHref ? (
                          <Link
                            href={learnerHref(l)}
                            className="block truncate font-medium text-ui-text hover:text-ui-brand-text hover:underline"
                          >
                            {l.fullName}
                          </Link>
                        ) : (
                          <p className="truncate font-medium text-ui-text">{l.fullName}</p>
                        )}
                        <p className="truncate text-xs text-ui-muted">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-ui-muted">{l.company || 'Not given'}</td>
                  <td className="whitespace-nowrap text-ui-muted">{fmtDate(l.joinedAt)}</td>
                  <td className="whitespace-nowrap text-ui-muted">{lastSeen(l.lastActiveAt)}</td>
                  <td className="text-right tabular-nums">
                    {l.coursesCompleted}/{l.coursesStarted}
                  </td>
                  <td className="text-right tabular-nums">{l.certificates}</td>
                  <td className="text-right tabular-nums">{l.mentorSessions}</td>
                  <td>
                    {l.avgProgress == null ? (
                      <span className="text-[13px] text-ui-muted">Not started</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={l.avgProgress} className="flex-1" label={`${l.fullName} progress`} />
                        <span className="w-9 text-right text-[13px] tabular-nums text-ui-muted">{l.avgProgress}%</span>
                      </div>
                    )}
                  </td>
                  {learnerAction && <td className="text-right">{learnerAction(l)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <p className="text-xs text-ui-muted">
        Courses shows completed out of started. Progress is the average across a participant&rsquo;s courses.
      </p>
    </div>
  )
}

/** The organisation's sign-up link with a copy button. */
export function JoinLinkCard({
  link,
  enabled,
  className,
  children,
}: {
  link: string
  enabled: boolean
  className?: string
  children?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Card className={cn('p-5', className)}>
      <h2 className="text-base font-semibold text-ui-text">Sign-up link</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">
        {enabled
          ? 'Share it with your people. Everyone who signs up with it joins your organisation here.'
          : 'This link is turned off. New sign-ups can’t use it.'}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          aria-label="Sign-up link"
          onFocus={(e) => e.currentTarget.select()}
          className={cn(inputClass, 'min-w-0 flex-1 bg-ui-surface-2 font-mono text-[13px]')}
        />
        <button
          type="button"
          disabled={!enabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            } catch {
              /* the field is selectable as a fallback */
            }
          }}
          className={btn({ className: 'h-10 shrink-0' })}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {children}
    </Card>
  )
}
