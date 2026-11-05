'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Timer,
  Users,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Avatar, Button, Card, Chip, EmptyState, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import {
  ConfirmModal,
  DateBox,
  IconTile,
  apiErrorMessage,
  browserTz,
  classifySessions,
  dayKey,
  durationLabel,
  fetchMe,
  fmtDay,
  fmtShort,
  fmtTime,
  isHttpsUrl,
  minutesBetween,
  startsInLabel,
  tzAbbr,
  updateMe,
  type ConfirmState,
  type MeUser,
} from '@/components/mentor/mentorKit'
import { completeMentorSessionApi, getMentorAnalytics, getMentorSessionsList, type SessionWithDetails, type SessionsData } from '@/lib/api/mentorSessions'
import { getMyAvailability, type AvailabilityData } from '@/lib/api/mentorAvailability'
import { getUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Analytics = { upcomingSessions: number; totalMentees: number; completedSessions: number }

function greeting(tz: string) {
  let h = new Date().getHours()
  try {
    h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()))
  } catch {
    // Unknown timezone: fall back to the browser hour.
  }
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const countWord = (n: number, one: string, many: string) => (n === 1 ? `one ${one}` : `${n} ${many}`)

export default function MentorOverview() {
  const [firstName, setFirstName] = useState('')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [sessions, setSessions] = useState<SessionsData | null>(null)
  const [availability, setAvailability] = useState<AvailabilityData | null>(null)
  const [me, setMe] = useState<MeUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(() => {
    return Promise.allSettled([getMentorAnalytics(), getMentorSessionsList(), fetchMe(), getMyAvailability()]).then(
      ([a, s, m, av]) => {
        if (a.status === 'fulfilled') setAnalytics(a.value)
        if (s.status === 'fulfilled') setSessions(s.value)
        if (m.status === 'fulfilled') setMe(m.value)
        if (av.status === 'fulfilled') setAvailability(av.value)
        if ([a, s, m, av].some((r) => r.status === 'rejected')) toast.error('Some of your dashboard could not be loaded. Try refreshing.')
        setNow(new Date())
      },
    )
  }, [])

  useEffect(() => {
    const u = getUser()
    setFirstName((u?.fullName ?? '').split(' ')[0] ?? '')
    load().finally(() => setLoading(false))
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [load])

  const tz = me?.timezone || browserTz()
  const todayKey = dayKey(now, tz)
  const groups = useMemo(() => (sessions ? classifySessions(sessions, now) : null), [sessions, now])
  const next = groups?.upcoming[0] ?? null
  const needsCount = groups?.needs.length ?? 0

  const openSlots = (availability?.upcoming ?? []).filter((s) => s.isAvailable)
  const openAfterToday = openSlots.filter((s) => dayKey(s.startsAt, tz) > todayKey).length

  const todayItems = useMemo(() => {
    const items: { key: string; startsAt: string; endsAt: string; kind: 'session' | 'open'; title: string; sub: string }[] = []
    for (const s of groups?.all ?? []) {
      if (s.status === 'cancelled' || dayKey(s.slot.startsAt, tz) !== todayKey) continue
      const len = durationLabel(minutesBetween(s.slot.startsAt, s.slot.endsAt))
      items.push({
        key: s.id,
        startsAt: s.slot.startsAt,
        endsAt: s.slot.endsAt,
        kind: 'session',
        title: `Session with ${s.smeUser.fullName}`,
        sub: s.status === 'completed' ? `Completed, ${len}` : `Booked, ${len}`,
      })
    }
    for (const sl of openSlots) {
      if (dayKey(sl.startsAt, tz) !== todayKey) continue
      items.push({ key: sl.id, startsAt: sl.startsAt, endsAt: sl.endsAt, kind: 'open', title: 'Open slot', sub: 'Not booked yet' })
    }
    return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, availability, tz, todayKey])

  const todaySessions = todayItems.filter((i) => i.kind === 'session').length
  const subtitle = loading
    ? 'Loading your mentoring overview.'
    : [
        todaySessions === 0 ? 'You have no sessions today' : `You have ${countWord(todaySessions, 'session', 'sessions')} today`,
        needsCount > 0 ? ` and ${countWord(needsCount, 'past session', 'past sessions')} to mark complete.` : '.',
        openAfterToday === 0
          ? ' Nothing is open for booking after today.'
          : ` ${openAfterToday} open slot${openAfterToday === 1 ? '' : 's'} after today.`,
      ].join('')

  const recentMentees = useMemo(() => {
    const map = new Map<string, { s: SessionWithDetails; last: string }>()
    for (const s of groups?.all ?? []) {
      const prev = map.get(s.smeUser.email)
      if (!prev || s.slot.startsAt > prev.last) map.set(s.smeUser.email, { s, last: s.slot.startsAt })
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last)).slice(0, 4)
  }, [groups])

  function markComplete(s: SessionWithDetails) {
    setConfirm({
      title: 'Mark as completed',
      message: `Confirm that your session with ${s.smeUser.fullName} has been completed. This cannot be undone.`,
      confirmLabel: 'Mark complete',
      variant: 'default',
      onConfirm: () => {
        setConfirm(null)
        completeMentorSessionApi(s.id)
          .then(() => {
            toast.success('Session marked as completed')
            return load()
          })
          .catch((err) => toast.error(apiErrorMessage(err, 'Failed to complete session')))
      },
    })
  }

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <PageHeader
          className="mb-0 items-center [&>div:first-child]:basis-full sm:[&>div:first-child]:basis-0"
          title={`${greeting(tz)}${firstName ? `, ${firstName}` : ''}`}
          subtitle={subtitle}
          actions={
            <>
              <Link href="/mentor/dashboard/calendar" className={cn(btn({ variant: 'secondary' }), 'hidden sm:inline-flex')}>
                <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                Calendar
              </Link>
              <Link href="/mentor/dashboard/availability" className={btn({ variant: 'secondary' })}>
                <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                Add availability
              </Link>
            </>
          }
        />

        {/* Meeting link warning with inline save */}
        {!loading && me && !me.meetingLink && <MeetingLinkAlert onSaved={(u) => setMe(u)} />}

        {/* Next session + Today */}
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {loading ? (
            <Card className="p-6"><Skeleton className="h-40" /></Card>
          ) : next ? (
            <NextSessionCard session={next} tz={tz} now={now} todayKey={todayKey} onComplete={() => markComplete(next)} />
          ) : (
            <Card className="flex flex-col justify-center shadow-ui">
              <EmptyState
                icon={CalendarDays}
                title="No upcoming sessions"
                body="When a mentee books one of your open slots, the session shows up here with a link to join."
                action={
                  <Link href="/mentor/dashboard/availability" className={btn({ variant: 'secondary', size: 'sm' })}>
                    Add availability
                  </Link>
                }
              />
            </Card>
          )}

          <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-ui-text">Today</h2>
              <span className="text-[13px] text-ui-muted">{fmtDay(now, tz)}</span>
            </div>
            {loading ? (
              <div className="flex flex-col gap-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : todayItems.length === 0 ? (
              <p className="py-3 text-sm text-ui-muted">Nothing scheduled today.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {todayItems.map((i) => (
                  <li key={i.key} className="grid grid-cols-[52px_12px_minmax(0,1fr)] items-start gap-3">
                    <span className="pt-px text-[13px] font-semibold tabular-nums text-ui-text">{fmtTime(i.startsAt, tz)}</span>
                    <span
                      aria-hidden
                      className={cn(
                        'mt-[5px] h-2.5 w-2.5 rounded-full',
                        i.kind === 'session' ? 'bg-ui-brand' : 'border-2 border-ui-brand',
                      )}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ui-text">{i.title}</span>
                      <span className="text-[13px] text-ui-muted">{i.sub}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <Link href="/mentor/dashboard/calendar" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'mt-auto')}>
              Open calendar
            </Link>
          </Card>
        </div>

        {/* Stats */}
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatLink href="/mentor/dashboard/sessions" icon={CalendarDays} label="Upcoming sessions" value={analytics?.upcomingSessions} loading={loading}>
            <span className="text-xs text-ui-muted">Confirmed</span>
          </StatLink>
          <StatLink href="/mentor/dashboard/mentees" icon={Users} label="Mentees" value={analytics?.totalMentees} loading={loading}>
            <span className="text-xs text-ui-muted">All time</span>
          </StatLink>
          <StatLink href="/mentor/dashboard/sessions" icon={CheckCircle2} label="Completed sessions" value={analytics?.completedSessions} loading={loading}>
            {needsCount > 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ui-brand-text">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {needsCount} need{needsCount === 1 ? 's' : ''} completion
              </span>
            ) : (
              <span className="text-xs text-ui-muted">Nothing to mark</span>
            )}
          </StatLink>
          <StatLink href="/mentor/dashboard/availability" icon={CalendarCheck} label="Open slots after today" value={openAfterToday} loading={loading}>
            <span className="text-xs text-ui-muted">{openAfterToday === 0 ? 'Mentees have nothing to book' : 'Ready for mentees to book'}</span>
          </StatLink>
        </section>

        {/* Availability prompt + recent mentees */}
        <div
          className={cn(
            'grid grid-cols-1 items-start gap-5',
            !loading && openAfterToday === 0 && 'xl:grid-cols-[minmax(0,1fr)_340px]',
          )}
        >
          {!loading && openAfterToday === 0 && (
            <section aria-labelledby="h-avail" className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3.5">
                <IconTile size={44}><CalendarPlus className="h-5 w-5" strokeWidth={1.75} /></IconTile>
                <div className="flex flex-col gap-1">
                  <h2 id="h-avail" className="text-lg font-semibold text-ui-text">Add availability to start receiving bookings</h2>
                  <p className="text-sm leading-normal text-ui-muted">
                    Women entrepreneurs browse mentor profiles and book open slots directly on your calendar. Set your available times so they can schedule a session with you.
                  </p>
                </div>
              </div>
              <ol aria-label="How booking works" className="flex flex-col items-start gap-3 rounded-xl bg-ui-surface-2 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
                {['Add open slots', 'A mentee books a time', 'Session confirmed'].map((label, i) => (
                  <li key={label} className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ui-text">
                      <span
                        className={cn(
                          'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs',
                          i === 0 ? 'bg-ui-brand text-white' : 'border border-ui-line bg-ui-surface text-ui-muted',
                        )}
                      >
                        {i + 1}
                      </span>
                      {label}
                    </span>
                    {i < 2 && <ArrowRight aria-hidden className="hidden h-4 w-4 text-ui-muted sm:block" />}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/mentor/dashboard/availability" className={btn()}>
                  <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  Add availability
                </Link>
                <Link href="/mentor/dashboard/profile" className={btn({ variant: 'secondary' })}>
                  <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  See your public profile
                </Link>
              </div>
            </section>
          )}

          <section aria-labelledby="h-mentees" className="rounded-[14px] border border-ui-line bg-ui-surface">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 id="h-mentees" className="text-base font-semibold text-ui-text">Recent mentees</h2>
              <Link href="/mentor/dashboard/mentees" className="text-[13px] font-semibold text-ui-brand-text hover:underline">View all</Link>
            </div>
            {loading ? (
              <div className="flex flex-col gap-3 border-t border-ui-line px-5 py-4"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            ) : recentMentees.length === 0 ? (
              <p className="border-t border-ui-line px-5 py-6 text-sm text-ui-muted">No mentees yet. They appear here after their first booking.</p>
            ) : (
              recentMentees.map(({ s, last }) => (
                <Link
                  key={s.smeUser.email}
                  href={`/mentor/dashboard/mentees?m=${encodeURIComponent(s.smeUser.email)}`}
                  className="flex items-center gap-3 border-t border-ui-line px-5 py-3 text-ui-text transition-colors hover:bg-ui-bg"
                >
                  <Avatar name={s.smeUser.fullName} src={s.smeUser.avatarUrl} size={34} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{s.smeUser.fullName}</span>
                    <span className="truncate text-xs text-ui-muted">{s.smeUser.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ui-muted">{fmtShort(last, tz)}</span>
                </Link>
              ))
            )}
          </section>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </MentorLayout>
  )
}

// ---------------------------------------------------------------------------

function StatLink({
  href,
  icon: Icon,
  label,
  value,
  loading,
  children,
}: {
  href: string
  icon: typeof Users
  label: string
  value: number | undefined
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-[14px] border border-ui-line bg-ui-surface px-4 py-4 text-ui-text transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui sm:px-[18px]"
    >
      <span className="flex items-start gap-2 text-[13px] font-medium text-ui-muted">
        <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.01em] tabular-nums">
        {loading ? <Skeleton className="h-7 w-10" /> : (value ?? '0')}
      </span>
      {children}
    </Link>
  )
}

function NextSessionCard({
  session: s,
  tz,
  now,
  todayKey,
  onComplete,
}: {
  session: SessionWithDetails
  tz: string
  now: Date
  todayKey: string
  onComplete: () => void
}) {
  const k = dayKey(s.slot.startsAt, tz)
  const tomorrowKey = dayKey(new Date(now.getTime() + 86400000), tz)
  const dayLabel = k === todayKey ? 'Today' : k === tomorrowKey ? 'Tomorrow' : fmtDay(s.slot.startsAt, tz)
  const mins = minutesBetween(s.slot.startsAt, s.slot.endsAt)
  return (
    <section aria-labelledby="h-next" className="flex flex-col gap-[18px] rounded-[14px] border border-ui-line bg-ui-surface px-5 py-5 shadow-ui sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ui-muted">Next session</span>
        <Chip tone="brand" className="rounded-full">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {startsInLabel(s.slot.startsAt, s.slot.endsAt, now, tz)}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <DateBox iso={s.slot.startsAt} tz={tz} className="hidden sm:flex" />
        <Avatar name={s.smeUser.fullName} src={s.smeUser.avatarUrl} size={52} />
        <div className="flex min-w-0 basis-full flex-col gap-1 sm:basis-0 sm:flex-1">
          <h2 id="h-next" className="text-xl font-semibold tracking-[-0.01em] text-ui-text">{s.smeUser.fullName}</h2>
          <span className="truncate text-sm text-ui-muted">{s.smeUser.email}</span>
          <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-ui-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {dayLabel}, {fmtTime(s.slot.startsAt, tz)} to {fmtTime(s.slot.endsAt, tz)} {tzAbbr(tz)}
            </span>
            {mins > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {durationLabel(mins)}
              </span>
            )}
            <Chip tone="brand" className="h-[22px] rounded-full">Confirmed</Chip>
          </span>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2.5 [&>*]:grow sm:[&>*]:grow-0">
        {s.meetingLink ? (
          <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className={btn()}>
            <Video className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            Join session
          </a>
        ) : (
          <Button disabled title="This session has no meeting link">
            <Video className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            No meeting link
          </Button>
        )}
        <Link href={`/mentor/dashboard/sessions#s-${s.id}`} className={btn({ variant: 'secondary' })}>
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          Session notes
        </Link>
        <Button variant="secondary" onClick={onComplete}>
          <Check className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          Mark complete
        </Button>
      </div>
    </section>
  )
}

function MeetingLinkAlert({ onSaved }: { onSaved: (u: MeUser) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = value.trim()
    if (!isHttpsUrl(v)) {
      setError('Enter a full link that starts with https://')
      return
    }
    setSaving(true)
    updateMe({ meetingLink: v })
      .then((u) => {
        toast.success('Meeting link saved')
        onSaved(u)
      })
      .catch((err) => setError(apiErrorMessage(err, 'Could not save the meeting link')))
      .finally(() => setSaving(false))
  }

  return (
    <section
      aria-labelledby="h-link"
      className="flex flex-col items-stretch gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface px-4 py-3.5 lg:flex-row lg:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:flex-row sm:items-center">
        <IconTile><AlertTriangle className="h-5 w-5" strokeWidth={1.75} /></IconTile>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="h-link" className="text-[15px] font-semibold text-ui-text">Add your meeting link</h2>
          <span className="text-[13px] leading-snug text-ui-muted">
            You haven&apos;t added a meeting link yet. Mentees won&apos;t be able to join your sessions.
          </span>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="flex w-full flex-col gap-1.5 lg:w-[420px]">
        <div className="flex gap-2">
          <label htmlFor="d-link" className="sr-only">Meeting link</label>
          <input
            id="d-link"
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
            }}
            placeholder="https://zoom.us/j/your-room"
            aria-invalid={!!error}
            aria-describedby={error ? 'd-link-err' : undefined}
            className={cn(inputClass, error && 'border-ui-danger')}
          />
          <Button type="submit" variant="secondary" disabled={saving || !value.trim()}>
            {saving ? 'Saving' : 'Save'}
          </Button>
        </div>
        {error && <p id="d-link-err" role="alert" className="text-[13px] text-ui-danger">{error}</p>}
      </form>
    </section>
  )
}
