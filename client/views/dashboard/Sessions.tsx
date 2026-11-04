'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  History,
  Info,
  Users,
  Video,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Avatar, Button, Card, EmptyState, PageHeader, Skeleton, btn } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { apiErrorMessage, getMentors, getSmeSessions, cancelSmeSession } from '@/lib/api/sme'
import type { MentorUser, SmeSession } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

type PastTab = 'completed' | 'cancelled'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tzAbbr(timeZone: string | null) {
  if (!timeZone) return ''
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    )
  } catch {
    return ''
  }
}

function formatWhen(iso: string, timeZone: string | null) {
  const tz = timeZone ? { timeZone } : {}
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...tz })
    .format(new Date(iso))
    .replace(/\bSept\b/, 'Sep')
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', ...tz }).format(new Date(iso))
  const abbr = tzAbbr(timeZone)
  return `${date}, ${time}${abbr ? ` ${abbr}` : ''}`
}

function durationMins(s: SmeSession) {
  return Math.max(0, Math.round((new Date(s.slot.endsAt).getTime() - new Date(s.slot.startsAt).getTime()) / 60000))
}

function formatDuration(mins: number) {
  if (mins <= 0) return null
  if (mins % 60 === 0) return mins === 60 ? '1 hour' : `${mins / 60} hours`
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function firstName(name: string) {
  return name.split(' ')[0]
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/** Compact segmented toggle; wraps on narrow phones instead of overflowing. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-ui-surface-2 p-[3px]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
              on ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,0.08)]' : 'text-ui-muted hover:text-ui-text',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="font-medium text-ui-muted tabular-nums">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Small confirm dialog in the kit style (cancel a session). */
function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cm-title"
        aria-describedby="cm-body"
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ui-danger-soft text-ui-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="cm-title" className="text-base font-semibold text-ui-text">{title}</h2>
            <p id="cm-body" className="text-sm leading-relaxed text-ui-muted">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Pieces (sessions) ───────────────────────────────────────────────────────────────────

function Pill({ tone, children }: { tone: 'brand' | 'ok' | 'muted' | 'danger'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
        tone === 'brand' && 'bg-ui-brand-soft text-ui-brand-text',
        tone === 'ok' && 'bg-ui-ok-soft text-ui-ok',
        tone === 'muted' && 'bg-ui-surface-2 text-ui-muted',
        tone === 'danger' && 'bg-ui-danger-soft text-ui-danger',
      )}
    >
      {children}
    </span>
  )
}

function Meta({ session, timezone, pastLink }: { session: SmeSession; timezone: string | null; pastLink?: boolean }) {
  const dur = formatDuration(durationMins(session))
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ui-muted">
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
        {formatWhen(session.slot.startsAt, timezone)}
      </span>
      {dur && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
          {dur}
        </span>
      )}
      {session.meetingLink ? (
        pastLink ? (
          <a
            href={session.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ui-muted underline-offset-2 hover:text-ui-text hover:underline"
          >
            <Video className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
            Meeting link
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Video className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
            Online meeting
          </span>
        )
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Video className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
          No meeting link yet
        </span>
      )}
    </div>
  )
}

function UpcomingCard({
  session,
  timezone,
  onCancel,
}: {
  session: SmeSession
  timezone: string | null
  onCancel: (s: SmeSession) => void
}) {
  const name = session.mentorUser.fullName
  return (
    <Card className="shadow-ui" aria-label={`Session with ${name}`}>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:px-5 sm:py-[18px]">
        <Avatar name={name} src={session.mentorUser.avatarUrl} size={48} className="max-sm:!h-11 max-sm:!w-11" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ui-text">{name}</h3>
            <Pill tone="brand">Confirmed</Pill>
          </div>
          <span className="truncate text-[13px] text-ui-muted">{session.mentorUser.email}</span>
          <Meta session={session} timezone={timezone} />
        </div>
        <div className="col-span-full flex gap-2 sm:col-span-1">
          <Button variant="secondary" className="max-sm:flex-1" onClick={() => onCancel(session)}>
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </Button>
          {session.meetingLink && (
            <a
              href={session.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(btn(), 'max-sm:flex-1')}
            >
              <Video className="h-4 w-4" aria-hidden />
              Join
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-ui-line px-4 py-3 text-[13px] text-ui-muted sm:px-5">
        <Info className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {session.meetingLink ? 'The meeting link opens in a new tab. ' : ''}If you cancel, {firstName(name)} is notified by email.
      </div>
    </Card>
  )
}

function PastRow({ session, timezone }: { session: SmeSession; timezone: string | null }) {
  const name = session.mentorUser.fullName
  const cancelled = session.status === 'cancelled'
  const ended = session.status === 'confirmed'
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-4 border-t border-ui-line p-4 first:border-t-0 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:px-5">
      <Avatar name={name} src={session.mentorUser.avatarUrl} size={44} className={cn(cancelled && 'opacity-60 grayscale')} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('text-[15px] font-semibold', cancelled ? 'text-ui-muted' : 'text-ui-text')}>{name}</h3>
          {cancelled ? (
            <Pill tone="muted">
              <Ban className="h-3 w-3" aria-hidden />
              Cancelled
            </Pill>
          ) : ended ? (
            <Pill tone="muted">Ended, awaiting mentor</Pill>
          ) : (
            <Pill tone="ok">
              <Check className="h-3 w-3" aria-hidden />
              Completed
            </Pill>
          )}
        </div>
        <span className="truncate text-[13px] text-ui-muted">{session.mentorUser.email}</span>
        <Meta session={session} timezone={timezone} pastLink={!cancelled} />
      </div>
      <div className="col-span-full sm:col-span-1">
        <Link href="/dashboard/human-mentors" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'max-sm:w-full')}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          {cancelled ? 'Rebook' : 'Book again'}
        </Link>
      </div>
    </li>
  )
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Check; label: string; value: string | number }) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-t border-ui-line py-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-muted">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="text-sm text-ui-muted">{label}</span>
      <span className="text-lg font-bold text-ui-text tabular-nums">{value}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SmeSessions() {
  const [pastTab, setPastTab] = useState<PastTab>('completed')
  const [upcoming, setUpcoming] = useState<SmeSession[]>([])
  const [past, setPast] = useState<SmeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [mentors, setMentors] = useState<MentorUser[]>([])
  const [toCancel, setToCancel] = useState<SmeSession | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadSessions = useCallback(
    () =>
      getSmeSessions().then(({ upcoming: u, past: p }) => {
        setUpcoming(u)
        setPast(p)
      }),
    [],
  )

  useEffect(() => {
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/auth/me')
      .then(({ data }) => setTimezone(data.user.timezone))
      .catch(() => {})
    getMentors()
      .then(setMentors)
      .catch(() => {})
    loadSessions()
      .catch((err: unknown) => toast.error(apiErrorMessage(err, 'Your sessions could not load. Refresh the page to try again.')))
      .finally(() => setLoading(false))
  }, [loadSessions])

  function confirmCancel() {
    if (!toCancel) return
    setCancelling(true)
    cancelSmeSession(toCancel.id)
      .then(() => {
        toast.success('Session cancelled')
        setToCancel(null)
        return loadSessions()
      })
      .catch((err: unknown) => toast.error(apiErrorMessage(err, 'The session could not be cancelled. Please try again.')))
      .finally(() => setCancelling(false))
  }

  // Past list: completed, plus sessions that ended without being marked
  // complete; cancelled sit in their own view.
  const completed = past.filter((s) => s.status === 'completed')
  const ended = past.filter((s) => s.status === 'confirmed')
  const cancelled = past.filter((s) => s.status === 'cancelled')
  const pastList = pastTab === 'completed' ? [...completed, ...ended] : cancelled
  pastList.sort((a, b) => b.slot.startsAt.localeCompare(a.slot.startsAt))

  const attendedMins = completed.reduce((acc, s) => acc + durationMins(s), 0)
  const mentorsWorkedWith = new Set(completed.map((s) => s.mentorUser.email)).size
  const abbr = tzAbbr(timezone)

  const suggestions = mentors
    .filter((m) => (m.expertise ?? []).some((e) => /^featured$/i.test(e)))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .slice(0, 3)

  return (
    <DashboardLayout>
      <PageHeader
        title="My Sessions"
        subtitle={`Your upcoming and past mentoring sessions.${timezone ? ` Times shown in your timezone (${timezone}${abbr ? `, ${abbr}` : ''}).` : ''}`}
        className="mb-[22px] max-sm:flex-col max-sm:items-start"
        actions={
          <Link href="/dashboard/human-mentors" className={btn()}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            Book a session
          </Link>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby="ss-up" className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 id="ss-up" className="text-lg font-semibold text-ui-text">Upcoming</h2>
              {!loading && (
                <span className="text-[13px] text-ui-muted">
                  {upcoming.length} {upcoming.length === 1 ? 'session' : 'sessions'}
                </span>
              )}
            </div>
            {loading ? (
              <Card className="flex items-center gap-4 p-5">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
              </Card>
            ) : upcoming.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming sessions"
                  body="Book a free one-on-one session with a verified business mentor."
                  action={
                    <Link href="/dashboard/human-mentors" className={btn({ variant: 'secondary', size: 'sm' })}>
                      Find a mentor
                    </Link>
                  }
                />
              </Card>
            ) : (
              upcoming.map((s) => <UpcomingCard key={s.id} session={s} timezone={timezone} onCancel={setToCancel} />)
            )}
          </section>

          <section aria-labelledby="ss-past" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ss-past" className="text-lg font-semibold text-ui-text">Past sessions</h2>
              <Segmented<PastTab>
                label="Past session status"
                value={pastTab}
                onChange={setPastTab}
                options={[
                  { value: 'completed', label: 'Completed', count: loading ? undefined : completed.length + ended.length },
                  { value: 'cancelled', label: 'Cancelled', count: loading ? undefined : cancelled.length },
                ]}
              />
            </div>
            {loading ? (
              <Card className="p-5">
                <Skeleton className="h-16 w-full" />
              </Card>
            ) : pastList.length === 0 ? (
              <Card>
                {pastTab === 'completed' ? (
                  <EmptyState
                    icon={History}
                    title="No completed sessions yet"
                    body="Sessions your mentor marks as complete appear here with your full history, so you can book the same mentor again."
                    className="py-12"
                  />
                ) : (
                  <EmptyState
                    icon={Ban}
                    title="No cancelled sessions"
                    body="Sessions you or your mentor cancel are recorded here."
                    className="py-12"
                  />
                )}
              </Card>
            ) : (
              <Card>
                <ul>
                  {pastList.map((s) => (
                    <PastRow key={s.id} session={s} timezone={timezone} />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="px-5 pb-1.5 pt-4">
            <h2 className="mb-2 text-base font-semibold text-ui-text">Your mentoring so far</h2>
            <StatRow icon={Check} label="Sessions attended" value={loading ? '-' : completed.length} />
            <StatRow icon={Clock} label="Hours of mentoring" value={loading ? '-' : (attendedMins / 60).toFixed(1)} />
            <StatRow icon={Users} label="Mentors worked with" value={loading ? '-' : mentorsWorkedWith} />
          </Card>

          {suggestions.length > 0 && (
            <Card className="flex flex-col gap-3.5 px-5 py-4">
              <h2 className="text-base font-semibold text-ui-text">Featured mentors</h2>
              {suggestions.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.fullName} src={m.avatarUrl} size={36} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-ui-text">{m.fullName}</span>
                    <span className="truncate text-xs text-ui-muted">
                      {(m.expertise ?? []).filter((e) => !/^featured$/i.test(e)).slice(0, 3).join(', ') || m.bio || 'Mentor'}
                    </span>
                  </span>
                  <Link
                    href={`/dashboard/human-mentors?mentor=${encodeURIComponent(m.id)}`}
                    aria-label={`Book ${m.fullName}`}
                    className="rounded text-[13px] font-semibold text-ui-brand-text hover:underline"
                  >
                    Book
                  </Link>
                </div>
              ))}
              <Link href="/dashboard/human-mentors" className={btn({ variant: 'secondary', size: 'sm' })}>
                See all mentors
              </Link>
            </Card>
          )}
        </div>
      </div>

      {toCancel && (
        <ConfirmModal
          title="Cancel this session?"
          message={`Your session with ${toCancel.mentorUser.fullName} on ${formatWhen(toCancel.slot.startsAt, timezone)} will be cancelled and ${firstName(toCancel.mentorUser.fullName)} is notified by email.`}
          confirmLabel="Cancel session"
          cancelLabel="Keep session"
          busy={cancelling}
          onConfirm={confirmCancel}
          onCancel={() => setToCancel(null)}
        />
      )}
    </DashboardLayout>
  )
}
