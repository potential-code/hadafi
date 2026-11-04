'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, Globe, Play, RefreshCw, Search, X } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, Chip, EmptyState, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import { fetchPublishedEvents, type LiveEvent } from '@/lib/api/liveEvents'
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

/** 'YYYY-MM-DD' as a local calendar day (no time zone shift). */
function dayOf(date: string) {
  const [y = 0, m = 1, d = 1] = date.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateParts(date: string) {
  const d = dayOf(date)
  return {
    month: d.toLocaleString('en-US', { month: 'short' }),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  }
}

const longDate = (date: string) =>
  dayOf(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** An event is over once its day has passed. */
function isPast(e: LiveEvent) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dayOf(e.date) < today
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function DateBlock({ date, size = 'md', soft }: { date: string; size?: 'sm' | 'md'; soft?: boolean }) {
  const { month, day, year } = dateParts(date)
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

function Meta({ event }: { event: LiveEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ui-muted">
      <span className="sr-only">{longDate(event.date)}</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
        {event.time}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Globe className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
        Online
      </span>
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

/** The main action for an event: the recording once it is over, the join link before. */
function PrimaryAction({ event, size, className }: { event: LiveEvent; size?: 'sm'; className?: string }) {
  const b = (variant?: 'secondary') => cn(btn({ variant, size }), size === 'sm' && 'h-9', className)
  if (isPast(event)) {
    return event.recordingLink ? (
      <a
        href={event.recordingLink}
        target="_blank"
        rel="noreferrer"
        className={b('secondary')}
        aria-label={`Watch the recording of ${event.title}`}
      >
        <Play className="h-4 w-4" aria-hidden />
        Watch recording
      </a>
    ) : (
      <span className={cn('self-center text-[13px] text-ui-muted', className)}>Recording coming soon</span>
    )
  }
  if (!event.meetingLink) return null
  return (
    <a href={event.meetingLink} target="_blank" rel="noreferrer" className={b()} aria-label={`Join ${event.title}`}>
      <ExternalLink className="h-4 w-4" aria-hidden />
      Join
    </a>
  )
}

function EventDetailModal({ event, onClose }: { event: LiveEvent; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const past = isPast(event)
  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const hasAction = past ? true : !!event.meetingLink

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
            {!past && <Chip tone="brand" className="h-[22px]">Coming up</Chip>}
            {past && event.recordingLink && <ReplayChip label="Replay available" />}
          </div>
          <h2 id="ev-detail-title" className="text-xl font-semibold leading-tight text-ui-text">{event.title}</h2>
          <div className="flex flex-col gap-1 text-sm text-ui-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {longDate(event.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {event.time}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              Online
            </span>
          </div>
          {event.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ui-text">{event.description}</p>}
          {!past && !event.meetingLink && (
            <p className="rounded-[12px] border border-ui-line bg-ui-bg p-3.5 text-sm text-ui-text">
              The join link appears here as soon as it is shared.
            </p>
          )}
        </div>
        {hasAction && (
          <div className="flex flex-col gap-2 border-t border-ui-line px-5 py-4">
            <PrimaryAction event={event} className="w-full" />
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

function FeaturedCard({ event, upcoming, onDetails }: { event: LiveEvent; upcoming: boolean; onDetails: (e: LiveEvent) => void }) {
  const titleId = `ev-feat-${event.id}`
  const showAction = upcoming ? !!event.meetingLink : !!event.recordingLink
  return (
    <Card
      aria-labelledby={titleId}
      className={cn('flex flex-wrap items-center gap-4 p-[18px] lg:flex-nowrap lg:gap-[22px] lg:px-6', upcoming ? 'shadow-ui lg:py-[22px]' : 'lg:py-5')}
    >
      <img
        src={eventArt(event)}
        alt=""
        className="hidden aspect-[2/1] w-[176px] shrink-0 rounded-[10px] bg-ui-surface-2 object-cover sm:block"
      />
      <DateBlock date={event.date} soft={upcoming} />
      <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip className="h-[22px]">{upcoming ? event.type : 'Latest session'}</Chip>
          {upcoming ? (
            <Chip tone="brand" className="h-[22px]">Coming up</Chip>
          ) : (
            event.recordingLink && <ReplayChip label="Replay available" />
          )}
        </div>
        <h3 id={titleId} className={cn('font-semibold tracking-[-0.01em] text-ui-text', upcoming ? 'text-[22px] leading-tight' : 'text-lg')}>
          {event.title}
        </h3>
        <Meta event={event} />
        {event.description && <p className="line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-ui-muted">{event.description}</p>}
      </div>
      <div className="flex w-full gap-2 lg:w-auto">
        {(upcoming || event.description || event.coverImage) && (
          <Button variant="secondary" className="max-lg:flex-1" onClick={() => onDetails(event)} aria-label={`Details for ${event.title}`}>
            Details
          </Button>
        )}
        {showAction && <PrimaryAction event={event} className="max-lg:flex-1" />}
      </div>
    </Card>
  )
}

function EventCard({ event, past, onDetails }: { event: LiveEvent; past: boolean; onDetails: (e: LiveEvent) => void }) {
  const hasDetails = !past || !!event.description || !!event.coverImage
  const hasAction = past || !!event.meetingLink
  return (
    <Card interactive className="flex flex-col overflow-hidden">
      <img src={eventArt(event)} alt="" loading="lazy" className="aspect-[2/1] w-full shrink-0 bg-ui-surface-2 object-cover" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <DateBlock date={event.date} size="sm" />
          <span className="flex flex-wrap gap-1.5">
            <Chip className="h-[22px]">{event.type}</Chip>
            {past && event.recordingLink && <ReplayChip />}
          </span>
        </div>
        <h3 className="text-[15px] font-semibold leading-[1.35] text-ui-text">{event.title}</h3>
        {event.description && <p className="line-clamp-2 text-[13px] leading-relaxed text-ui-muted">{event.description}</p>}
        <div className="mt-auto">
          <Meta event={event} />
        </div>
      </div>
      {(hasAction || hasDetails) && (
        <div className="flex gap-2 border-t border-ui-line px-4 py-3">
          {hasAction && <PrimaryAction event={event} size="sm" className="flex-1" />}
          {hasDetails && (
            <Button
              variant="secondary"
              size="sm"
              className={cn('h-9', !hasAction && 'flex-1')}
              onClick={() => onDetails(event)}
              aria-label={`Details for ${event.title}`}
            >
              Details
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [detailEvent, setDetailEvent] = useState<LiveEvent | null>(null)
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [pastPage, setPastPage] = useState(1)
  const [q, setQ] = useState('')

  function load() {
    setLoading(true)
    setError(false)
    fetchPublishedEvents()
      .then((data) => {
        setEvents(data)
        setUpcomingPage(1)
        setPastPage(1)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const query = q.trim().toLowerCase()
  const visible = useMemo(
    () => (query ? events.filter((e) => `${e.title} ${e.description ?? ''} ${e.type}`.toLowerCase().includes(query)) : events),
    [events, query],
  )

  // Upcoming soonest first; recordings newest first.
  const upcoming = visible.filter((e) => !isPast(e)).sort((a, b) => a.date.localeCompare(b.date))
  const past = visible.filter((e) => isPast(e)).sort((a, b) => b.date.localeCompare(a.date))
  const [featuredUpcoming, ...allRestUpcoming] = upcoming
  const [featuredPast, ...allRestPast] = past

  const upcomingPageCount = Math.ceil(allRestUpcoming.length / GRID_PAGE_SIZE)
  const pastPageCount = Math.ceil(allRestPast.length / GRID_PAGE_SIZE)
  const restUpcoming = allRestUpcoming.slice((upcomingPage - 1) * GRID_PAGE_SIZE, upcomingPage * GRID_PAGE_SIZE)
  const restPast = allRestPast.slice((pastPage - 1) * GRID_PAGE_SIZE, pastPage * GRID_PAGE_SIZE)

  return (
    <DashboardLayout>
      <PageHeader
        title="Events"
        subtitle="Join business experts live, or watch the replay any time."
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <Button variant="secondary" size="sm" onClick={load}>
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
            {featuredUpcoming && <FeaturedCard event={featuredUpcoming} upcoming onDetails={setDetailEvent} />}
            {restUpcoming.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {restUpcoming.map((e) => (
                  <EventCard key={e.id} event={e} past={false} onDetails={setDetailEvent} />
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
              {featuredPast && <FeaturedCard event={featuredPast} upcoming={false} onDetails={setDetailEvent} />}
              {restPast.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {restPast.map((e) => (
                    <EventCard key={e.id} event={e} past onDetails={setDetailEvent} />
                  ))}
                </div>
              )}
              <Pagination page={pastPage} pageCount={pastPageCount} onPage={setPastPage} label="Recordings pages" />
            </section>
          )}
        </div>
      )}

      {detailEvent && <EventDetailModal event={detailEvent} onClose={() => setDetailEvent(null)} />}
    </DashboardLayout>
  )
}
