'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, Chip, EmptyState, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import { apiBookEvent, apiCancelBooking, fetchMyEvents, type LiveEvent } from '@/lib/api/liveEvents'
import { errorMessage } from '@/lib/api/errors'
import { dateParts, eventPhaseAt, longDayLabel, timeRange, untilLabel, useNow, type EventPhase } from '@/lib/events/eventTime'
import { downloadIcs, googleCalendarUrl } from '@/lib/events/calendar'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

const GRID_PAGE_SIZE = 6

/** Events without their own cover borrow one of the program's webinar banners (as on the homepage). */
const EVENT_ART = ['/images/events/webinar-1.webp', '/images/events/webinar-2.webp', '/images/events/webinar-3.webp']

/** The event's cover, else a webinar banner picked by id so it stays put across pages. */
function eventArt(e: LiveEvent) {
  if (e.coverImage) return optimizedSrc(e.coverImage)
  let h = 0
  for (let i = 0; i < e.id.length; i++) h = (h * 31 + e.id.charCodeAt(i)) >>> 0
  return EVENT_ART[h % EVENT_ART.length]
}

const phaseOf = (e: LiveEvent, now: number | null): EventPhase => (now === null ? 'upcoming' : eventPhaseAt(e, now))

/** The start in the event's own zone, for a viewer elsewhere ("6:00 PM Riyadh time"). */
function eventZoneTime(e: LiveEvent): string | null {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  const fmt = (tz: string) => new Date(e.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  try {
    if (fmt(local) === fmt(e.timezone)) return null
    const city = e.timezone === 'Asia/Dubai' ? 'UAE' : (e.timezone.split('/').pop() ?? e.timezone).replace(/_/g, ' ')
    return `${fmt(e.timezone)} ${city} time`
  } catch {
    return null
  }
}

function whereLabel(e: LiveEvent): string {
  if (e.format === 'in_person') return e.location ?? 'In person'
  if (e.format === 'zoom') return 'Online, on Zoom'
  return 'Online'
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function DateBlock({ startsAt, size = 'md', soft }: { startsAt: string; size?: 'sm' | 'md'; soft?: boolean }) {
  const { month, day, year } = dateParts(startsAt)
  return (
    <span
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-px rounded-xl border',
        size === 'md' ? 'w-[76px] py-2.5' : 'w-14 py-2',
        soft ? 'border-transparent bg-ui-brand-soft' : 'border-ui-line bg-ui-surface',
      )}
      aria-hidden
    >
      <span className="text-xs font-semibold text-ui-brand-text">{month}</span>
      <span className={cn('font-bold leading-[1.1] text-ui-text tabular-nums', size === 'md' ? 'text-[26px]' : 'text-[19px]')}>{day}</span>
      <span className="text-[11px] text-ui-muted tabular-nums">{year}</span>
    </span>
  )
}

function Meta({ event, past }: { event: LiveEvent; past: boolean }) {
  const Where = event.format === 'in_person' ? MapPin : event.format === 'zoom' ? Video : Globe
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ui-muted">
      <span className="sr-only">{longDayLabel(event.startsAt)}</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
        {timeRange(event.startsAt, event.endsAt)}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Where className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{whereLabel(event)}</span>
      </span>
      {!past && !event.booked && event.spotsLeft != null && (
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          {event.full ? 'Fully booked' : `${event.spotsLeft} ${event.spotsLeft === 1 ? 'place' : 'places'} left`}
        </span>
      )}
    </div>
  )
}

function ReplayChip({ label = 'Replay' }: { label?: string }) {
  return (
    <Chip tone="brand" className="h-[22px]">
      <Play className="h-3 w-3 fill-current" aria-hidden />
      {label}
    </Chip>
  )
}

/** Book and cancel, shared by the cards and the details. */
function useBooking(event: LiveEvent, onChange: (e: LiveEvent) => void) {
  const [busy, setBusy] = useState(false)
  async function book() {
    setBusy(true)
    try {
      const e = await apiBookEvent(event.id)
      onChange(e)
      toast.success('You’re booked', {
        description:
          e.format === 'in_person'
            ? 'We’ll remind you the day before and an hour before.'
            : e.meetingLink
              ? 'Your join link is ready on this page.'
              : 'Your join link appears here an hour before the start. We’ll remind you the day before and an hour before.',
      })
    } catch (err) {
      toast.error(errorMessage(err, 'The booking didn’t go through. Please try again.'))
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    setBusy(true)
    try {
      onChange(await apiCancelBooking(event.id))
      toast.success('Booking cancelled')
    } catch (err) {
      toast.error(errorMessage(err, 'The booking couldn’t be cancelled. Please try again.'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, book, cancel }
}

/** The main button for an event: replay, book, join (once the link is there), or booked. */
function PrimaryAction({
  event,
  now,
  onChange,
  onDetails,
  size,
  className,
}: {
  event: LiveEvent
  now: number | null
  onChange: (e: LiveEvent) => void
  onDetails: (e: LiveEvent) => void
  size?: 'sm'
  className?: string
}) {
  const { busy, book } = useBooking(event, onChange)
  const phase = phaseOf(event, now)
  const b = (variant?: 'secondary') => cn(btn({ variant, size }), size === 'sm' && 'h-9', className)

  if (phase === 'ended') {
    return event.recordingLink ? (
      <a href={event.recordingLink} target="_blank" rel="noreferrer" className={b('secondary')} aria-label={`Watch the recording of ${event.title}`}>
        <Play className="h-4 w-4" aria-hidden />
        Watch recording
      </a>
    ) : (
      <span className={cn('self-center text-[13px] text-ui-muted', className)}>Recording coming soon</span>
    )
  }
  if (!event.booked) {
    if (event.full) {
      return (
        <button type="button" className={b('secondary')} disabled aria-label={`${event.title} is fully booked`}>
          Fully booked
        </button>
      )
    }
    return (
      <button type="button" className={b()} onClick={book} disabled={busy} aria-label={`Book a place at ${event.title}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
        Book my place
      </button>
    )
  }
  if (event.format !== 'in_person' && event.meetingLink) {
    const now2 = phase === 'opening' || phase === 'live'
    return (
      <a href={event.meetingLink} target="_blank" rel="noreferrer" className={b(now2 ? undefined : 'secondary')} aria-label={`Join ${event.title}`}>
        <ExternalLink className="h-4 w-4" aria-hidden />
        {phase === 'live' ? 'Join now' : 'Join'}
      </a>
    )
  }
  return (
    <button type="button" className={b('secondary')} onClick={() => onDetails(event)} aria-label={`Booked. Details for ${event.title}`}>
      <CalendarCheck className="h-4 w-4 text-ui-ok" aria-hidden />
      Booked
    </button>
  )
}

function BookedNote({ event, phase, now }: { event: LiveEvent; phase: EventPhase; now: number | null }) {
  if (event.format === 'in_person') return <p className="text-sm text-ui-text">You&rsquo;re booked. See you at {event.location}.</p>
  if (event.meetingLink) {
    return (
      <p className="text-sm text-ui-text">
        {phase === 'live' ? 'It’s on now. Join with the button below.' : 'Your join link is ready. Join with the button below.'}
        {event.format === 'zoom' && ' This Zoom link is yours alone, so please don’t share it.'}
      </p>
    )
  }
  if (event.joinPending) {
    return <p className="text-sm text-ui-text">Your personal Zoom link is being set up. It appears here shortly.</p>
  }
  return (
    <p className="text-sm text-ui-text">
      You&rsquo;re booked. Your join link appears here
      {event.joinOpensAt && now !== null ? ` ${untilLabel(event.joinOpensAt, now)}` : ' an hour before the start'}, and we&rsquo;ll remind you the
      day before and an hour before.
    </p>
  )
}

function EventDetailModal({
  event,
  now,
  onChange,
  onClose,
}: {
  event: LiveEvent
  now: number | null
  onChange: (e: LiveEvent) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const phase = phaseOf(event, now)
  const past = phase === 'ended'
  const { busy, cancel } = useBooking(event, onChange)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const zoneTime = eventZoneTime(event)
  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const showPrimary = past || !event.booked || !!event.meetingLink

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-detail-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui"
      >
        {event.coverImage && <img src={optimizedSrc(event.coverImage)} alt="" className="h-48 w-full shrink-0 object-cover" />}
        <Button ref={closeRef} variant="secondary" size="icon-sm" aria-label="Close" onClick={onClose} className="absolute end-3 top-3 z-10">
          <X className="h-4 w-4" aria-hidden />
        </Button>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 pe-14">
          <div className="flex flex-wrap gap-1.5">
            <Chip className="h-[22px]">{event.type}</Chip>
            {phase === 'live' && <Chip tone="danger" className="h-[22px]">Live now</Chip>}
            {!past && phase !== 'live' && !event.booked && <Chip tone="brand" className="h-[22px]">Coming up</Chip>}
            {event.booked && !past && (
              <Chip tone="ok" className="h-[22px]">
                <CalendarCheck className="h-3 w-3" aria-hidden />
                Booked
              </Chip>
            )}
            {past && event.recordingLink && <ReplayChip label="Replay available" />}
          </div>
          <h2 id="ev-detail-title" className="text-xl font-semibold leading-tight text-ui-text">{event.title}</h2>
          <div className="flex flex-col gap-1 text-sm text-ui-muted">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {longDayLabel(event.startsAt)}
              {!past && now !== null && phase !== 'live' && <span className="text-ui-text">· {untilLabel(event.startsAt, now)}</span>}
            </span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Clock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {timeRange(event.startsAt, event.endsAt)}
              {zoneTime && <span>({zoneTime})</span>}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {event.format === 'in_person' ? (
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              ) : (
                <Globe className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              )}
              {whereLabel(event)}
            </span>
            {!past && !event.booked && event.spotsLeft != null && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {event.full ? 'Fully booked' : `${event.spotsLeft} ${event.spotsLeft === 1 ? 'place' : 'places'} left`}
              </span>
            )}
          </div>
          {event.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ui-text">{event.description}</p>}

          {event.booked && !past && (
            <div className="flex flex-col gap-2 rounded-[12px] border border-ui-line bg-ui-bg p-3.5">
              <BookedNote event={event} phase={phase} now={now} />
              {event.format === 'zoom' && event.meetingId && (
                <p className="text-[13px] text-ui-muted">
                  Zoom meeting ID {event.meetingId}
                  {event.passcode ? `, passcode ${event.passcode}` : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn({ variant: 'secondary', size: 'sm' })} onClick={() => downloadIcs(event)}>
                  <CalendarPlus className="h-4 w-4" aria-hidden />
                  Add to calendar
                </button>
                <a
                  href={googleCalendarUrl(event)}
                  target="_blank"
                  rel="noreferrer"
                  className={btn({ variant: 'secondary', size: 'sm' })}
                  aria-label={`Add ${event.title} to Google Calendar`}
                >
                  Google Calendar
                </a>
              </div>
            </div>
          )}
        </div>
        {(showPrimary || (event.booked && !past)) && (
          <div className="flex flex-col gap-2 border-t border-ui-line px-5 py-4">
            {showPrimary && <PrimaryAction event={event} now={now} onChange={onChange} onDetails={() => undefined} className="w-full" />}
            {event.booked &&
              !past &&
              (confirmCancel ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ui-text">Cancel your booking?</span>
                  <span className="flex gap-2">
                    <button type="button" className={btn({ variant: 'ghost', size: 'sm' })} onClick={() => setConfirmCancel(false)}>
                      Keep it
                    </button>
                    <button type="button" className={btn({ variant: 'secondary', size: 'sm' })} onClick={cancel} disabled={busy}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      Cancel booking
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="self-center rounded text-[13px] font-semibold text-ui-muted hover:text-ui-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
                  onClick={() => setConfirmCancel(true)}
                >
                  Can&rsquo;t make it? Cancel booking
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Pagination({ page, pageCount, onPage, label }: { page: number; pageCount: number; onPage: (p: number) => void; label: string }) {
  if (pageCount <= 1) return null
  const pages: (number | '...')[] =
    pageCount <= 5
      ? Array.from({ length: pageCount }, (_, i) => i + 1)
      : page <= 3
        ? [1, 2, 3, 4, '...', pageCount]
        : page >= pageCount - 2
          ? [1, '...', pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
          : [1, '...', page - 1, page, page + 1, '...', pageCount]
  const cell =
    'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand disabled:cursor-not-allowed disabled:opacity-45'
  return (
    <nav aria-label={label} className="flex flex-wrap justify-center gap-1.5">
      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(cell, 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2')}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="inline-flex h-9 w-6 items-center justify-center text-ui-muted" aria-hidden>
            ...
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={page === p ? 'page' : undefined}
            aria-label={`Page ${p}`}
            onClick={() => onPage(p)}
            className={cn(cell, page === p ? 'border-ui-text bg-ui-text text-ui-bg' : 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(cell, 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2')}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  )
}

function FeaturedCard({
  event,
  upcoming,
  now,
  onChange,
  onDetails,
}: {
  event: LiveEvent
  upcoming: boolean
  now: number | null
  onChange: (e: LiveEvent) => void
  onDetails: (e: LiveEvent) => void
}) {
  const titleId = `ev-feat-${event.id}`
  const phase = phaseOf(event, now)
  const showAction = upcoming || !!event.recordingLink
  return (
    <Card
      aria-labelledby={titleId}
      className={cn('flex flex-wrap items-center gap-4 p-[18px] lg:flex-nowrap lg:gap-[22px] lg:px-6', upcoming ? 'shadow-ui lg:py-[22px]' : 'lg:py-5')}
    >
      <img src={eventArt(event)} alt="" className="hidden aspect-[2/1] w-[176px] shrink-0 rounded-[10px] bg-ui-surface-2 object-cover sm:block" />
      <DateBlock startsAt={event.startsAt} soft={upcoming} />
      <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip className="h-[22px]">{upcoming ? event.type : 'Latest session'}</Chip>
          {upcoming ? (
            phase === 'live' ? (
              <Chip tone="danger" className="h-[22px]">Live now</Chip>
            ) : event.booked ? (
              <Chip tone="ok" className="h-[22px]">
                <CalendarCheck className="h-3 w-3" aria-hidden />
                Booked
              </Chip>
            ) : (
              <Chip tone="brand" className="h-[22px]">Coming up</Chip>
            )
          ) : (
            event.recordingLink && <ReplayChip label="Replay available" />
          )}
        </div>
        <h3 id={titleId} className={cn('font-semibold tracking-[-0.01em] text-ui-text', upcoming ? 'text-[22px] leading-tight' : 'text-lg')}>
          {event.title}
        </h3>
        <Meta event={event} past={!upcoming} />
        {event.description && <p className="line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-ui-muted">{event.description}</p>}
      </div>
      <div className="flex w-full gap-2 lg:w-auto">
        {(upcoming || event.description || event.coverImage) && (
          <Button variant="secondary" className="max-lg:flex-1" onClick={() => onDetails(event)} aria-label={`Details for ${event.title}`}>
            Details
          </Button>
        )}
        {showAction && <PrimaryAction event={event} now={now} onChange={onChange} onDetails={onDetails} className="max-lg:flex-1" />}
      </div>
    </Card>
  )
}

function EventCard({
  event,
  past,
  now,
  onChange,
  onDetails,
}: {
  event: LiveEvent
  past: boolean
  now: number | null
  onChange: (e: LiveEvent) => void
  onDetails: (e: LiveEvent) => void
}) {
  const hasDetails = !past || !!event.description || !!event.coverImage
  return (
    <Card interactive className="flex flex-col overflow-hidden">
      <img src={eventArt(event)} alt="" loading="lazy" className="aspect-[2/1] w-full shrink-0 bg-ui-surface-2 object-cover" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <DateBlock startsAt={event.startsAt} size="sm" />
          <span className="flex flex-wrap gap-1.5">
            <Chip className="h-[22px]">{event.type}</Chip>
            {past && event.recordingLink && <ReplayChip />}
            {!past && event.booked && (
              <Chip tone="ok" className="h-[22px]">
                <CalendarCheck className="h-3 w-3" aria-hidden />
                Booked
              </Chip>
            )}
          </span>
        </div>
        <h3 className="text-[15px] font-semibold leading-[1.35] text-ui-text">{event.title}</h3>
        {event.description && <p className="line-clamp-2 text-[13px] leading-relaxed text-ui-muted">{event.description}</p>}
        <div className="mt-auto">
          <Meta event={event} past={past} />
        </div>
      </div>
      <div className="flex gap-2 border-t border-ui-line px-4 py-3">
        <PrimaryAction event={event} now={now} onChange={onChange} onDetails={onDetails} size="sm" className="flex-1" />
        {hasDetails && (
          <Button variant="secondary" size="sm" className="h-9" onClick={() => onDetails(event)} aria-label={`Details for ${event.title}`}>
            Details
          </Button>
        )}
      </div>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const qc = useQueryClient()
  const now = useNow()
  // Refetched every minute, so the join link shows up when it opens.
  const { data: events = [], isLoading: loading, isError: error, refetch } = useQuery({
    queryKey: ['live-events', 'mine'],
    queryFn: fetchMyEvents,
    refetchInterval: 60_000,
  })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [pastPage, setPastPage] = useState(1)
  const [q, setQ] = useState('')

  function update(e: LiveEvent) {
    qc.setQueryData<LiveEvent[]>(['live-events', 'mine'], (cur) => (cur ?? []).map((x) => (x.id === e.id ? e : x)))
  }
  const detailEvent = events.find((e) => e.id === detailId) ?? null
  const isPast = (e: LiveEvent) => phaseOf(e, now) === 'ended'

  const query = q.trim().toLowerCase()
  const visible = useMemo(
    () => (query ? events.filter((e) => `${e.title} ${e.description ?? ''} ${e.type}`.toLowerCase().includes(query)) : events),
    [events, query],
  )

  // Upcoming: what she booked first, then soonest first. Recordings newest first.
  const upcoming = visible
    .filter((e) => !isPast(e))
    .sort((a, b) => Number(!!b.booked) - Number(!!a.booked) || a.startsAt.localeCompare(b.startsAt))
  const past = visible.filter((e) => isPast(e)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const [featuredUpcoming, ...allRestUpcoming] = upcoming
  const [featuredPast, ...allRestPast] = past

  const upcomingPageCount = Math.ceil(allRestUpcoming.length / GRID_PAGE_SIZE)
  const pastPageCount = Math.ceil(allRestPast.length / GRID_PAGE_SIZE)
  const restUpcoming = allRestUpcoming.slice((upcomingPage - 1) * GRID_PAGE_SIZE, upcomingPage * GRID_PAGE_SIZE)
  const restPast = allRestPast.slice((pastPage - 1) * GRID_PAGE_SIZE, pastPage * GRID_PAGE_SIZE)
  const cardProps = { now, onChange: update, onDetails: (e: LiveEvent) => setDetailId(e.id) }

  return (
    <DashboardLayout>
      <PageHeader
        title="Events"
        subtitle="Book a place, join business experts live, or watch the replay any time."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <div className="relative w-full sm:w-[300px]">
            <label htmlFor="ev-search" className="sr-only">
              Search events
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" aria-hidden />
            <input
              id="ev-search"
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setUpcomingPage(1)
                setPastPage(1)
              }}
              placeholder="Search events"
              className={cn(inputClass, 'h-[42px] ps-9')}
            />
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading events">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-[120px] w-full rounded-[14px]" />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-52 rounded-[14px]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Events could not load"
            body="Something went wrong while loading events."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </Button>
            }
          />
        </Card>
      ) : query && visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="No events match"
            body={`Nothing matches "${q.trim()}". Try another word.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setQ('')}>
                Clear search
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="ev-up" className="flex flex-col gap-3.5">
            <h2 id="ev-up" className="text-lg font-semibold text-ui-text">Upcoming</h2>
            {featuredUpcoming && <FeaturedCard event={featuredUpcoming} upcoming {...cardProps} />}
            {restUpcoming.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {restUpcoming.map((e) => (
                  <EventCard key={e.id} event={e} past={false} {...cardProps} />
                ))}
              </div>
            )}
            <Pagination page={upcomingPage} pageCount={upcomingPageCount} onPage={setUpcomingPage} label="Upcoming events pages" />
            {upcoming.length <= 1 && (
              <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-ui-line px-[18px] py-4 text-sm text-ui-muted">
                <CalendarDays className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                {upcoming.length === 0
                  ? query
                    ? 'No upcoming events match your search.'
                    : 'No events are scheduled right now. New webinars appear here as soon as they are announced.'
                  : 'No other events are scheduled yet. New webinars appear here as soon as they are announced.'}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="ev-rec" className="flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="ev-rec" className="text-lg font-semibold text-ui-text">Recordings</h2>
                <span className="text-[13px] text-ui-muted">Past webinars</span>
              </div>
              {featuredPast && <FeaturedCard event={featuredPast} upcoming={false} {...cardProps} />}
              {restPast.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {restPast.map((e) => (
                    <EventCard key={e.id} event={e} past {...cardProps} />
                  ))}
                </div>
              )}
              <Pagination page={pastPage} pageCount={pastPageCount} onPage={setPastPage} label="Recordings pages" />
            </section>
          )}
        </div>
      )}

      {detailEvent && <EventDetailModal event={detailEvent} now={now} onChange={update} onClose={() => setDetailId(null)} />}
    </DashboardLayout>
  )
}
