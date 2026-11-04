'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarPlus, Play } from 'lucide-react'
import { btn, Chip, FilterChips, Skeleton } from '@/components/kit'
import { cn } from '@/lib/utils'
import { fetchPublicEvents, fetchPublicOffers, type PublicEvent, type PublicOffer } from './publicData'

const SHOW = 3

function parseDate(d: string) {
  const [year = '', month = '', day = ''] = d.split('-')
  const label = new Date(`${year}-${month || '01'}-01T00:00:00`).toLocaleString('en-US', { month: 'short' })
  return { month: label, day: day.replace(/^0/, ''), year }
}

/** "5:00 PM / GST - UAE time" → "5:00 PM GST (UAE time)" (no dashes in visible copy). */
function tidyTime(t: string) {
  const m = t.match(/^(.*?)\s*\/\s*(\w+)\s*-\s*(.*)$/)
  return m ? `${m[1]} ${m[2]} (${m[3]})` : t.replace(/\s+[-–—]\s+/g, ', ')
}

/** Today as YYYY-MM-DD in the visitor's time zone. */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LandingEventsOffers() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null)
  const [offers, setOffers] = useState<PublicOffer[] | null>(null)
  const [eventsFailed, setEventsFailed] = useState(false)
  const [offersFailed, setOffersFailed] = useState(false)

  useEffect(() => {
    fetchPublicEvents()
      .then((data) => {
        // Upcoming first (soonest first), then past events (most recent first).
        const now = today()
        const upcoming = data.filter((e) => e.date >= now).sort((a, b) => a.date.localeCompare(b.date))
        const past = data.filter((e) => e.date < now).sort((a, b) => b.date.localeCompare(a.date))
        setEvents([...upcoming, ...past])
      })
      .catch(() => {
        setEventsFailed(true)
        setEvents([])
      })
    fetchPublicOffers()
      .then(setOffers)
      .catch(() => {
        setOffersFailed(true)
        setOffers([])
      })
  }, [])

  const showEvents = events === null || events.length > 0 || eventsFailed
  const showOffers = offers === null || offers.length > 0 || offersFailed
  if (!showEvents && !showOffers) return null

  return (
    <section aria-labelledby="h-evof" className="pb-9 pt-2">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex max-w-[820px] flex-col gap-2">
          <h2 id="h-evof" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
            Events and offers
          </h2>
          <p className="text-base leading-[1.55] text-ui-muted">
            Live webinars with AI and business experts, and member offers from program partners.
          </p>
        </div>
        <div className={cn('grid grid-cols-1 items-stretch gap-5', showEvents && showOffers && 'min-[900px]:grid-cols-2')}>
          {showEvents && <EventsCard events={events} failed={eventsFailed} />}
          {showOffers && <OffersCard offers={offers} failed={offersFailed} />}
        </div>
      </div>
    </section>
  )
}

function CardTop({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-[22px] py-3.5">
      <h3 className="text-[17px] font-semibold text-ui-text">{title}</h3>
      <span className="text-[13px] text-ui-muted">{meta}</span>
    </div>
  )
}

function CardFoot({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-auto border-t border-ui-line px-[22px] py-3.5">
      <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline">
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2 border-t border-ui-line px-[22px] py-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[52px]" />
      ))}
    </div>
  )
}

function EventsCard({ events, failed }: { events: PublicEvent[] | null; failed: boolean }) {
  const now = today()
  return (
    <div id="events" className="flex min-w-0 scroll-mt-[84px] flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
      <CardTop title="Live events" meta="Online, with global access" />
      {failed ? (
        <p className="border-t border-ui-line px-[22px] py-4 text-sm text-ui-muted">
          <Link href="/sign-up" className="font-semibold text-ui-brand-text hover:underline">
            Sign up free
          </Link>{' '}
          to see upcoming webinars and watch past recordings.
        </p>
      ) : events === null ? (
        <RowsSkeleton />
      ) : (
        <ul>
          {events.slice(0, SHOW).map((ev) => {
            const { month, day, year } = parseDate(ev.date)
            const upcoming = ev.date >= now
            return (
              <li
                key={ev.id}
                className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 border-t border-ui-line px-[22px] py-2.5 min-[520px]:grid-cols-[52px_minmax(0,1fr)_auto]"
              >
                <span
                  aria-hidden
                  className="row-span-2 flex h-[52px] w-[52px] flex-col items-center justify-center rounded-[10px] border border-ui-line text-[11px] leading-[1.2] text-ui-muted min-[520px]:row-span-1"
                >
                  {month}
                  <strong className="text-lg text-ui-text">{day}</strong>
                  {year}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="sr-only">
                    {month} {day}, {year}:
                  </span>
                  <span className="text-[15px] font-semibold leading-snug text-ui-text">{ev.title}</span>
                  <span className="text-[13px] text-ui-muted">
                    {ev.type}, {upcoming ? tidyTime(ev.time) : 'online'}
                  </span>
                </span>
                <Link
                  href="/sign-up"
                  className="col-start-2 inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-ui-brand-text hover:underline min-[520px]:col-start-3"
                >
                  {upcoming ? (
                    <>
                      <CalendarPlus className="h-[15px] w-[15px]" aria-hidden />
                      Register to join
                    </>
                  ) : (
                    <>
                      <Play className="h-[15px] w-[15px]" aria-hidden />
                      {ev.recordingLink ? 'Watch recording' : 'View details'}
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {events && events.length > 0 && <CardFoot href="/sign-up" label="Browse the full event archive" />}
    </div>
  )
}

function OffersCard({ offers, failed }: { offers: PublicOffer[] | null; failed: boolean }) {
  const [active, setActive] = useState('All')
  const categories = ['All', ...Array.from(new Set((offers ?? []).map((o) => o.category).filter(Boolean)))]
  const filtered = active === 'All' ? (offers ?? []) : (offers ?? []).filter((o) => o.category === active)

  return (
    <div id="offers" className="flex min-w-0 scroll-mt-[84px] flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
      <CardTop title="Member offers" meta="From program partners" />
      {failed ? (
        <p className="border-t border-ui-line px-[22px] py-4 text-sm text-ui-muted">
          <Link href="/sign-up" className="font-semibold text-ui-brand-text hover:underline">
            Sign up free
          </Link>{' '}
          to see every member offer from program partners.
        </p>
      ) : offers === null ? (
        <RowsSkeleton />
      ) : (
        <>
          {categories.length > 2 && (
            <FilterChips
              label="Filter offers by category"
              active={active}
              onChange={setActive}
              className="mx-0 border-t border-ui-line px-[22px] py-2.5 [&>button]:h-[30px] [&>button]:px-3"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          )}
          <ul>
            {filtered.slice(0, SHOW).map((o) => (
              <li
                key={o.id}
                className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-t border-ui-line px-[22px] py-3 min-[520px]:grid-cols-[minmax(0,1fr)_auto]"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-[1.35] text-ui-text">{o.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px]">
                    {o.category && <Chip className="h-5 text-[11px] font-medium">{o.category}</Chip>}
                    <strong className="font-semibold text-ui-text">{o.priceLabel}</strong>
                    {o.priceBefore && <s className="text-ui-muted">{o.priceBefore}</s>}
                    {o.pointsCost > 0 && <span className="text-ui-muted">{o.pointsCost} points</span>}
                  </span>
                </span>
                <Link
                  href="/sign-up"
                  className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-[34px] justify-self-start')}
                >
                  Reveal coupon
                </Link>
              </li>
            ))}
          </ul>
          <CardFoot href="/sign-up" label={`See all ${offers.length} offers`} />
        </>
      )}
    </div>
  )
}
