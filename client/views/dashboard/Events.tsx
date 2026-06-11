'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  Clock,
  MapPin,
  PlayCircle,
  Sparkles,
  ArrowRight,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import {
  fetchPublishedEvents,
  type LiveEvent,
} from '@/lib/api/liveEvents'
import { gsap, useGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

type EventItem = LiveEvent

const GRID_PAGE_SIZE = 6

function parseDate(d: string) {
  const [year = '', monthNum = '', dayRaw = ''] = d.split('-')
  const month = new Date(`${year}-${monthNum}-01`).toLocaleString('en-US', { month: 'short' })
  return { month, day: dayRaw.replace(/^0/, ''), year }
}

// ── Event detail modal ──────────────────────────────────────────────────────

function EventDetailModal({
  event,
  onClose,
}: {
  event: EventItem | null
  onClose: () => void
}) {
  if (!event) return null

  const { month, day, year } = parseDate(event.date)
  const isPast = new Date(event.date) < new Date(new Date().setHours(0, 0, 0, 0))
  const primaryLink = isPast ? event.recordingLink : null

  return (
    <AnimatePresence>
      <motion.div
        key="event-detail-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-brand-surface-2 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Cover image */}
          {event.coverImage && (
            <div className="relative h-48 flex-shrink-0 bg-brand-surface-2">
              <Image src={event.coverImage} alt={event.title} fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-brand-text-muted hover:bg-white hover:text-brand-text-primary transition-colors shadow-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Type badge */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider">
              <Calendar className="w-2.5 h-2.5" />
              {event.type}
            </span>

            {/* Title */}
            <h2 className="text-xl font-black text-brand-text-primary leading-tight">
              {event.title}
            </h2>

            {/* Date + time */}
            <div className="flex flex-wrap gap-4 text-sm text-brand-text-muted">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                {day} {month} {year}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                {event.time}
              </span>
            </div>

            {/* Description */}
            {event.description && (
              <p className="text-sm text-brand-text-muted leading-relaxed">
                {event.description}
              </p>
            )}
          </div>

          {/* Footer CTA */}
          <div className="flex-shrink-0 border-t border-brand-surface-2 px-6 py-4 flex gap-2">
            {isPast ? (
              primaryLink ? (
                <a
                  href={primaryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  <PlayCircle className="w-4 h-4" />
                  Watch Recording
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              ) : null
            ) : (
              event.meetingLink ? (
                <a
                  href={event.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="w-4 h-4" />
                  Join
                </a>
              ) : null
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Pagination ──────────────────────────────────────────────────────────────

function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  if (pageCount <= 1) return null

  function visiblePages(): (number | '...')[] {
    if (pageCount <= 5) {
      return Array.from({ length: pageCount }, (_, i) => i + 1)
    }
    const pages: (number | '...')[] = []
    if (page <= 3) {
      pages.push(1, 2, 3, 4, '...', pageCount)
    } else if (page >= pageCount - 2) {
      pages.push(1, '...', pageCount - 3, pageCount - 2, pageCount - 1, pageCount)
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', pageCount)
    }
    return pages
  }

  return (
    <div className="flex items-center justify-center gap-1.5 mt-5">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {visiblePages().map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-brand-text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className={cn(
              'w-8 h-8 rounded-lg text-xs font-bold transition-colors',
              page === p
                ? 'bg-brand-primary text-white'
                : 'bg-white border border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/30'
            )}
            aria-current={page === p ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page === pageCount}
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── FeaturedCard ────────────────────────────────────────────────────────────

function FeaturedCard({
  event,
  badge,
  replayBadge,
}: {
  event: EventItem
  badge: string
  replayBadge?: boolean
}) {
  const { month, day, year } = parseDate(event.date)
  const isPast = new Date(event.date) < new Date(new Date().setHours(0, 0, 0, 0))

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-deep via-brand-deep to-brand-violet/60 text-white border border-white/10"
    >
      <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
      <motion.div
        aria-hidden
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-primary/40 blur-3xl"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      <div className="relative p-6 sm:p-8">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-[0.18em]">
            <Sparkles className="w-3 h-3 text-brand-primary-light" />
            {badge}
          </span>
          {replayBadge && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-200 text-[10px] font-bold uppercase tracking-[0.18em]">
              <PlayCircle className="w-3 h-3" />
              Replay available
            </span>
          )}
        </div>

        {/* Content row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
          {/* Date block */}
          <div className="rounded-xl bg-white text-brand-text-primary text-center px-5 py-3 shadow-xl min-w-[84px] flex-shrink-0">
            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">{month}</p>
            <p className="text-3xl font-black leading-none mt-1">{day}</p>
            <p className="text-[10px] text-brand-text-muted mt-1 font-bold tracking-wider">{year}</p>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-black leading-tight text-white group-hover:text-brand-primary-light transition-colors">
              {event.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/70">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-primary-light flex-shrink-0" />
                {event.time}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-primary-light flex-shrink-0" />
                Online · global access
              </span>
            </div>
            {event.description && (
              <p className="mt-2 text-sm text-white/55 line-clamp-2">{event.description}</p>
            )}
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {isPast ? (
              event.recordingLink ? (
                <a
                  href={event.recordingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-brand-primary text-sm font-bold hover:bg-brand-primary hover:text-white transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  Watch Recording
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </a>
              ) : null
            ) : (
              event.meetingLink ? (
                <a
                  href={event.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-brand-primary text-sm font-bold hover:bg-brand-primary hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Join
                </a>
              ) : null
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── EventCard ───────────────────────────────────────────────────────────────

interface EventCardProps {
  event: EventItem
  isPast: boolean
  index: number
  onViewDetails: (e: EventItem) => void
}

function EventCard({ event, isPast, index, onViewDetails }: EventCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { month, day, year } = parseDate(event.date)
  const hasRecording = isPast && !!event.recordingLink

  useGSAP(
    () => {
      const card = cardRef.current
      if (!card) return

      function onEnter() {
        gsap.to('[data-date-block]', { scale: 1.08, y: -2, duration: 0.25, ease: 'back.out(2)' })
        gsap.to('[data-cta-arrow]', { x: 3, duration: 0.2 })
      }

      function onLeave() {
        gsap.to('[data-date-block]', { scale: 1, y: 0, duration: 0.2 })
        gsap.to('[data-cta-arrow]', { x: 0, duration: 0.18 })
      }

      card.addEventListener('mouseenter', onEnter)
      card.addEventListener('mouseleave', onLeave)

      return () => {
        card.removeEventListener('mouseenter', onEnter)
        card.removeEventListener('mouseleave', onLeave)
      }
    },
    { scope: cardRef },
  )

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.985, transition: { duration: 0.12 } }}
      className="group flex flex-col bg-white rounded-2xl border border-brand-surface-2 hover:border-brand-primary/40 hover:shadow-[0_12px_36px_-10px_rgba(159,32,99,0.18)] transition-all overflow-hidden"
    >
      {/* ── Header: with-image or gradient ────────────────────────────── */}
      {event.coverImage ? (
        <div className="relative h-40 bg-brand-surface-2 flex-shrink-0 overflow-hidden">
          <Image
            src={event.coverImage}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Replay badge top-right */}
          {isPast && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[9px] font-bold">
              <PlayCircle className="w-2.5 h-2.5" /> Replay
            </span>
          )}

          {/* Date badge bottom-left */}
          <div
            data-date-block
            className="absolute bottom-3 left-3 rounded-lg bg-white/95 backdrop-blur-sm shadow-lg text-center px-2.5 py-1.5 min-w-[52px]"
          >
            <p className="text-[8px] font-bold uppercase tracking-wider text-brand-primary">{month}</p>
            <p className="text-base font-black leading-none text-brand-text-primary">{day}</p>
            <p className="text-[8px] text-brand-text-muted font-semibold">{year}</p>
          </div>
        </div>
      ) : (
        <div className="relative bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet/80 px-4 py-4 flex-shrink-0 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3">
            <div
              data-date-block
              className="rounded-xl bg-white/95 shadow-lg text-center px-3 py-2.5 min-w-[60px]"
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-brand-primary">{month}</p>
              <p className="text-xl font-black leading-none text-brand-text-primary mt-0.5">{day}</p>
              <p className="text-[9px] text-brand-text-muted font-semibold mt-0.5">{year}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-white text-[10px] font-bold uppercase tracking-wider">
                {event.type}
              </span>
              {isPast && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/30 text-emerald-200 text-[9px] font-bold">
                  <PlayCircle className="w-2.5 h-2.5" /> Replay
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Perforated divider ────────────────────────────────────────── */}
      <div className="relative h-0 border-t border-dashed border-brand-surface-2 group-hover:border-brand-primary/20 transition-colors">
        <span className="absolute -top-2 left-3 w-4 h-4 rounded-full bg-brand-surface border border-brand-surface-2 pointer-events-none" />
        <span className="absolute -top-2 right-3 w-4 h-4 rounded-full bg-brand-surface border border-brand-surface-2 pointer-events-none" />
      </div>

      {/* ── Content body ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 px-4 py-3.5">
        {/* Show type badge only if has image (gradient header already shows type) */}
        {event.coverImage && (
          <span className="mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider w-fit">
            <Calendar className="w-2.5 h-2.5" />
            {event.type}
          </span>
        )}
        <h3 className="text-sm font-bold text-brand-text-primary group-hover:text-brand-primary transition-colors line-clamp-2 leading-snug">
          {event.title}
        </h3>
        {event.description && (
          <p className="mt-1.5 text-[11px] text-brand-text-muted line-clamp-2 leading-relaxed">
            {event.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-brand-text-muted">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-brand-primary flex-shrink-0" />
            {event.time}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-brand-primary flex-shrink-0" />
            Online
          </span>
        </div>
      </div>

      {/* ── CTA footer ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-brand-surface-2 px-4 py-3 flex items-center gap-2">
        {isPast ? (
          hasRecording ? (
            <a
              href={event.recordingLink!}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-primary text-white text-xs font-bold rounded-xl px-3 py-2 hover:bg-brand-primary-dark transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Watch Recording
              <span data-cta-arrow className="inline-block">
                <ArrowRight className="w-3 h-3" />
              </span>
            </a>
          ) : (
            <span className="text-[11px] text-brand-text-muted italic flex-1">
              Recording coming soon
            </span>
          )
        ) : (
          <>
            {event.meetingLink && (
              <a
                href={event.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-brand-primary text-white text-xs font-bold rounded-xl px-3 py-2 hover:bg-brand-primary-dark transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Join
                <span data-cta-arrow className="inline-block">
                  <ArrowRight className="w-3 h-3" />
                </span>
              </a>
            )}
            <button
              onClick={() => onViewDetails(event)}
              className="inline-flex items-center gap-1 border border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/40 hover:text-brand-primary text-xs font-bold rounded-xl px-3 py-2 transition-colors"
            >
              Details
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── EventGrid ───────────────────────────────────────────────────────────────

function EventGrid({
  events,
  isPast,
  onViewDetails,
}: {
  events: EventItem[]
  isPast: boolean
  onViewDetails: (e: EventItem) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map((e, i) => (
        <EventCard
          key={e.id}
          event={e}
          isPast={isPast}
          index={i}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  )
}

// ── EventsPage ──────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null)
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [pastPage, setPastPage] = useState(1)

  useEffect(() => {
    fetchPublishedEvents()
      .then((data) => {
        setEvents(data)
        setUpcomingPage(1)
        setPastPage(1)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = events.filter(e => new Date(e.date) >= today)
  const past = events.filter(e => new Date(e.date) < today)

  const [featuredUpcoming, ...allRestUpcoming] = upcoming
  const [featuredPast, ...allRestPast] = past

  const upcomingPageCount = Math.ceil(allRestUpcoming.length / GRID_PAGE_SIZE)
  const pastPageCount = Math.ceil(allRestPast.length / GRID_PAGE_SIZE)

  const restUpcoming = allRestUpcoming.slice(
    (upcomingPage - 1) * GRID_PAGE_SIZE,
    upcomingPage * GRID_PAGE_SIZE
  )
  const restPast = allRestPast.slice(
    (pastPage - 1) * GRID_PAGE_SIZE,
    pastPage * GRID_PAGE_SIZE
  )

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Live events"
        title="Webinars &"
        highlight="live sessions"
        subtitle="Join AI and business experts live, or watch the replay anytime."
      />

      <div className="space-y-10">
        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-40 bg-brand-surface-2 rounded-2xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-52 bg-brand-surface-2 rounded-2xl" />
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-brand-surface-2 p-8 text-center text-brand-text-muted text-sm">
            Couldn&apos;t load events. Please try again later.
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Upcoming events ── */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-brand-text-muted mb-4">
                  Upcoming
                </h2>
                <div className="space-y-4">
                  {featuredUpcoming && (
                    <FeaturedCard
                      event={featuredUpcoming}
                      badge="Coming up"
                    />
                  )}
                  {restUpcoming.length > 0 && (
                    <EventGrid
                      events={restUpcoming}
                      isPast={false}
                      onViewDetails={setDetailEvent}
                    />
                  )}
                  <Pagination
                    page={upcomingPage}
                    pageCount={upcomingPageCount}
                    onPage={setUpcomingPage}
                  />
                </div>
              </section>
            )}

            {/* ── Past recordings ── */}
            {past.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-brand-text-muted mb-4">
                  Recordings
                </h2>
                <div className="space-y-4">
                  {featuredPast && (
                    <FeaturedCard
                      event={featuredPast}
                      badge="Latest session"
                      replayBadge
                    />
                  )}
                  {restPast.length > 0 && (
                    <EventGrid
                      events={restPast}
                      isPast={true}
                      onViewDetails={setDetailEvent}
                    />
                  )}
                  <Pagination
                    page={pastPage}
                    pageCount={pastPageCount}
                    onPage={setPastPage}
                  />
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
      />
    </DashboardLayout>
  )
}
