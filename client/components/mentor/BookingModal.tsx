'use client'

/**
 * Learner booking panel for a human mentor (Human Mentors page).
 * Shows a 7-day strip of the learner's own calendar days, the mentor's real
 * open slots from `/api/mentors/:id/availability` grouped by the learner's
 * timezone, a summary and the confirm action. Kept in this file (formerly the
 * booking modal) because the Human Mentors page is its only consumer; the
 * assistant's MentorBookingWidget has its own calendar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarCheck2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Linkedin,
  Loader2,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { apiErrorMessage, getMentorAvailability, bookSession } from '@/lib/api/sme'
import type { Slot, SmeSession } from '@/lib/api/sme'
import { Avatar, Button, Chip, EmptyState, Skeleton, btn } from '@/components/kit'
import { cn } from '@/lib/utils'

export interface BookingPanelMentor {
  userId: string
  name: string
  avatarUrl: string | null
  linkedinUrl: string | null
  featured: boolean
  expertise: string[]
}

// ── Date helpers (all keyed as YYYY-MM-DD in the learner's timezone) ──────────

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function dateKeyIn(iso: string | Date, timeZone: string) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  )
}

/** Noon UTC of a date key, so weekday/day arithmetic never crosses a boundary. */
function keyToDate(key: string) {
  return new Date(`${key}T12:00:00Z`)
}

function addDays(key: string, n: number) {
  const d = keyToDate(key)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtKey(key: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(keyToDate(key)).replace(/\bSept\b/, 'Sep')
}

function rangeLabel(start: string, end: string) {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return sameMonth
    ? `${fmtKey(start, { day: 'numeric' })} to ${fmtKey(end, { day: 'numeric', month: 'short' })}`
    : `${fmtKey(start, { day: 'numeric', month: 'short' })} to ${fmtKey(end, { day: 'numeric', month: 'short' })}`
}

function fmtTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
}

function fmtDuration(slot: Slot) {
  const mins = Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins <= 0) return '1 hour'
  if (mins % 60 === 0) return mins === 60 ? '1 hour' : `${mins / 60} hours`
  return `${mins} minutes`
}

function tzAbbr(timeZone: string) {
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export function BookingPanel({ mentor, className }: { mentor: BookingPanelMentor; className?: string }) {
  const [timezone, setTimezone] = useState<string>(browserTz)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [windowStart, setWindowStart] = useState<string>(() => dateKeyIn(new Date(), browserTz()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<{ session: SmeSession; slot: Slot } | null>(null)

  // The learner's saved timezone wins over the browser's.
  useEffect(() => {
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/account/me')
      .then(({ data }) => {
        if (data.user.timezone) setTimezone(data.user.timezone)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    setSlots(null)
    setLoadFailed(false)
    getMentorAvailability(mentor.userId)
      .then((byDay) => setSlots(Object.values(byDay).flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt))))
      .catch(() => {
        setSlots([])
        setLoadFailed(true)
      })
  }, [mentor.userId])

  useEffect(() => {
    setSelectedSlot(null)
    setSelectedDate(null)
    setBooked(null)
    load()
  }, [load])

  const today = dateKeyIn(new Date(), timezone)

  // Slots regrouped by the learner's local date (the API groups by UTC date).
  const byDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots ?? []) {
      if (!s.isAvailable) continue
      const k = dateKeyIn(s.startsAt, timezone)
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return map
  }, [slots, timezone])

  // When slots arrive, open the strip on the first week that has times and
  // preselect that first day.
  useEffect(() => {
    if (!slots) return
    const first = [...byDate.keys()].sort()[0]
    if (!first) {
      setWindowStart(today)
      return
    }
    const start = first > addDays(today, 6) ? first : today
    setWindowStart(start)
    setSelectedDate(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, timezone])

  const days = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i))
  const windowEnd = days[6]
  const hasAny = byDate.size > 0
  const daySlots = selectedDate ? byDate.get(selectedDate) ?? [] : []
  const prevDisabled = windowStart <= today

  function shiftWeek(dir: 1 | -1) {
    const next = dir === 1 ? addDays(windowStart, 7) : addDays(windowStart, -7) < today ? today : addDays(windowStart, -7)
    setWindowStart(next)
    const firstWithSlots = Array.from({ length: 7 }, (_, i) => addDays(next, i)).find((k) => byDate.has(k)) ?? null
    setSelectedDate(firstWithSlots)
    setSelectedSlot(null)
  }

  async function confirm() {
    if (!selectedSlot) return
    setBooking(true)
    try {
      const result = await bookSession(selectedSlot.id)
      setBooked({ session: result.session, slot: selectedSlot })
      toast.success(`Session booked with ${mentor.name}`, {
        description: result.session.meetingLink
          ? 'We emailed you a calendar invite with the meeting link.'
          : 'We emailed you a calendar invite.',
      })
    } catch (err: unknown) {
      const e = err as { error?: { code?: string } }
      if (e?.error?.code === 'SLOT_UNAVAILABLE') {
        toast.error('That time was just taken. Please pick another one.')
        setSelectedSlot(null)
        load()
      } else {
        toast.error(apiErrorMessage(err, 'Could not book the session. Please try again.'))
      }
    } finally {
      setBooking(false)
    }
  }

  const tags = mentor.expertise.filter((t) => !/^featured$/i.test(t))
  const abbr = tzAbbr(timezone)
  const firstName = mentor.name.split(' ')[0]

  return (
    <section
      aria-labelledby="bk-name"
      className={cn('flex flex-col gap-[18px] rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui', className)}
    >
      <div className="flex items-center gap-3.5">
        <Avatar name={mentor.name} src={mentor.avatarUrl} size={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="bk-name" className="text-lg font-semibold leading-tight text-ui-text">{mentor.name}</h2>
          <span className="flex items-center gap-1.5">
            {mentor.featured && (
              <Chip tone="brand" className="h-[22px]">
                <Star className="h-3 w-3" strokeWidth={2} aria-hidden />
                Featured
              </Chip>
            )}
            <span className="text-[13px] text-ui-muted">Mentor</span>
          </span>
        </div>
        {mentor.linkedinUrl && (
          <a
            href={mentor.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${mentor.name} on LinkedIn`}
            className={cn(btn({ variant: 'secondary', size: 'icon-sm' }), 'h-9 w-9')}
          >
            <Linkedin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </a>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ui-text">Expertise</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Chip key={t} className="font-medium">{t}</Chip>
            ))}
          </div>
        </div>
      )}

      {booked ? (
        <div className="flex flex-col gap-4 border-t border-ui-line pt-4" role="status">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
              <CalendarCheck2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-ui-text">Session booked</h3>
              <p className="text-[13px] text-ui-muted">
                {booked.session.meetingLink
                  ? 'Check your email for the calendar invite with the meeting link.'
                  : 'Check your email for the calendar invite.'}
              </p>
            </div>
          </div>
          <dl className="flex flex-col gap-2.5 rounded-[10px] bg-ui-surface-2 p-3.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ui-muted">Date and time</dt>
              <dd className="text-right font-semibold text-ui-text">
                {fmtKey(dateKeyIn(booked.slot.startsAt, timezone), { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                {fmtTime(booked.slot.startsAt, timezone)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ui-muted">Duration</dt>
              <dd className="font-semibold text-ui-text">{fmtDuration(booked.slot)}</dd>
            </div>
          </dl>
          {booked.session.meetingLink && (
            <a href={booked.session.meetingLink} target="_blank" rel="noreferrer" className={cn(btn(), 'w-full')}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open meeting link
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/sessions" className={btn({ variant: 'secondary' })}>
              My sessions
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setBooked(null)
                setSelectedSlot(null)
                load()
              }}
            >
              Book another
            </Button>
          </div>
        </div>
      ) : slots === null ? (
        <div className="flex flex-col gap-3 border-t border-ui-line pt-4" aria-busy="true" aria-label="Loading open times">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-[62px]" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !hasAny ? (
        <div className="border-t border-ui-line pt-2">
          <EmptyState
            icon={CalendarX2}
            title={loadFailed ? 'Open times could not load' : 'No open times right now'}
            body={
              loadFailed
                ? 'Something went wrong while loading this mentor’s calendar. Try again in a moment.'
                : `${firstName} has not opened any times yet. Check back soon, or pick another mentor.`
            }
            action={
              loadFailed ? (
                <Button variant="secondary" size="sm" onClick={load}>
                  Try again
                </Button>
              ) : undefined
            }
            className="py-6"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-t border-ui-line pt-4">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[15px] font-semibold text-ui-text">Select a date and time</h3>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Previous 7 days"
                disabled={prevDisabled}
                onClick={() => shiftWeek(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="whitespace-nowrap text-[13px] font-semibold text-ui-text tabular-nums">
                {rangeLabel(windowStart, windowEnd)}
              </span>
              <Button variant="secondary" size="icon-sm" aria-label="Next 7 days" onClick={() => shiftWeek(1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div role="group" aria-label="Days" className="grid grid-cols-7 gap-1.5">
              {days.map((k) => {
                const open = byDate.has(k)
                const on = k === selectedDate
                const label = fmtKey(k, { weekday: 'long', day: 'numeric', month: 'long' })
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={!open}
                    aria-label={open ? label : `${label}, no open times`}
                    title={open ? undefined : 'No open times'}
                    onClick={() => {
                      if (!open) return
                      setSelectedDate(k)
                      setSelectedSlot(null)
                    }}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-[10px] border py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
                      on
                        ? 'border-ui-brand bg-ui-brand text-white'
                        : open
                          ? 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand'
                          : 'cursor-not-allowed border-transparent bg-ui-surface-2 text-ui-muted',
                    )}
                  >
                    <span className={cn('text-xs font-medium', on ? 'text-white/85' : 'text-ui-muted')}>
                      {fmtKey(k, { weekday: 'short' })}
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">{fmtKey(k, { day: 'numeric' })}</span>
                    <span
                      aria-hidden
                      className={cn('h-[5px] w-[5px] rounded-full', open ? (on ? 'bg-white' : 'bg-ui-brand') : 'invisible')}
                    />
                  </button>
                )
              })}
            </div>

            {selectedDate && daySlots.length > 0 ? (
              <>
                <span className="text-[13px] text-ui-muted">
                  {fmtKey(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <div role="group" aria-label="Open times" className="grid grid-cols-3 gap-2">
                  {daySlots.map((s) => {
                    const on = selectedSlot?.id === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelectedSlot(s)}
                        className={cn(
                          'h-10 rounded-[10px] border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
                          on
                            ? 'border-ui-brand bg-ui-brand-soft text-ui-brand-text'
                            : 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand',
                        )}
                      >
                        {fmtTime(s.startsAt, timezone)}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="rounded-[10px] bg-ui-surface-2 px-3 py-3 text-center text-[13px] text-ui-muted">
                No open times this week. Use the arrows to see other weeks.
              </p>
            )}
            <p className="text-xs text-ui-muted">
              Days with a dot have open times. Times shown in your timezone ({timezone}
              {abbr ? `, ${abbr}` : ''}).
            </p>
          </div>

          <dl className="flex flex-col gap-2.5 rounded-[10px] bg-ui-surface-2 p-3.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ui-muted">Date and time</dt>
              <dd className="text-right font-semibold text-ui-text">
                {selectedSlot
                  ? `${fmtKey(dateKeyIn(selectedSlot.startsAt, timezone), { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtTime(selectedSlot.startsAt, timezone)}`
                  : 'Pick a time'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ui-muted">Duration</dt>
              <dd className="font-semibold text-ui-text">{selectedSlot ? fmtDuration(selectedSlot) : '1 hour'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ui-muted">Cost</dt>
              <dd className="text-right font-semibold text-ui-text">Free for Hadafi members</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2.5">
            <Button className="w-full" disabled={!selectedSlot || booking} onClick={confirm}>
              {booking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Booking
                </>
              ) : (
                'Confirm booking'
              )}
            </Button>
            <p className="text-center text-xs text-ui-muted">You get a confirmation email and the meeting link.</p>
          </div>
        </>
      )}
    </section>
  )
}
