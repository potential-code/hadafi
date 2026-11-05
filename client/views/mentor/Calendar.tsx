'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronLeft, ChevronRight, Video } from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Button, PageHeader, Skeleton, btn } from '@/components/kit'
import { browserTz, tzAbbr } from '@/components/mentor/mentorKit'
import { getMentorSessionsList, type SessionsData } from '@/lib/api/mentorSessions'
import { getMyAvailability, type AvailabilityData } from '@/lib/api/mentorAvailability'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers (browser local time, same as the availability grid)
// ---------------------------------------------------------------------------

const ROW = 52 // px per hour in week view

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function startOfWeek(d: Date) {
  const x = dayStart(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first)
  const last = new Date(year, month + 1, 0)
  const end = addDays(startOfWeek(last), 6)
  const out: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}
const f = (d: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', o).format(new Date(d))
const time = (d: Date | string) => f(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

type Ev = {
  id: string
  kind: 'booked' | 'open' | 'cancelled'
  start: Date
  end: Date
  title: string
  status?: string
  meetingLink?: string | null
}

type Placed = Ev & { lane: number; lanes: number }

/** Side-by-side lanes for overlapping events within one day. */
function placeDay(events: Ev[]): Placed[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = 0
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const c of cluster) out.push({ ...c, lanes })
    cluster = []
  }
  for (const e of sorted) {
    if (cluster.length && e.start.getTime() >= clusterEnd) flush()
    const used = new Set(cluster.filter((c) => c.end.getTime() > e.start.getTime()).map((c) => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ ...e, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, e.end.getTime())
  }
  if (cluster.length) flush()
  return out
}

// ---------------------------------------------------------------------------

export default function MentorCalendar() {
  const [now, setNow] = useState(() => new Date())
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selected, setSelected] = useState(() => dayStart(new Date()))
  const [miniMonth, setMiniMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [sessions, setSessions] = useState<SessionsData | null>(null)
  const [availability, setAvailability] = useState<AvailabilityData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    return Promise.allSettled([getMentorSessionsList(), getMyAvailability()]).then(([s, a]) => {
      if (s.status === 'fulfilled') setSessions(s.value)
      if (a.status === 'fulfilled') setAvailability(a.value)
      if (s.status === 'rejected' || a.status === 'rejected') toast.error('Some calendar items could not be loaded')
    })
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    setMiniMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }, [selected])

  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = []
    const seen = new Set<string>()
    for (const s of [...(sessions?.upcoming ?? []), ...(sessions?.past ?? [])]) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({
        id: s.id,
        kind: s.status === 'cancelled' ? 'cancelled' : 'booked',
        start: new Date(s.slot.startsAt),
        end: new Date(s.slot.endsAt),
        title: s.smeUser.fullName,
        status: s.status,
        meetingLink: s.meetingLink,
      })
    }
    for (const sl of [...(availability?.upcoming ?? []), ...(availability?.past ?? [])]) {
      if (!sl.isAvailable) continue
      out.push({ id: sl.id, kind: 'open', start: new Date(sl.startsAt), end: new Date(sl.endsAt), title: 'Open slot' })
    }
    return out
  }, [sessions, availability])

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of events) {
      const k = localKey(e.start)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    for (const list of m.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime())
    return m
  }, [events])

  const todayKey = localKey(now)
  const weekStart = startOfWeek(selected)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const title =
    view === 'week'
      ? (() => {
          const end = weekDays[6]
          const sameYear = weekStart.getFullYear() === end.getFullYear()
          return `${f(weekStart, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} to ${f(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
        })()
      : f(selected, { month: 'long', year: 'numeric' })

  function step(dir: -1 | 1) {
    if (view === 'week') setSelected((d) => addDays(d, dir * 7))
    else setSelected((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1))
  }

  const selKey = localKey(selected)
  const dayItems = byDay.get(selKey) ?? []
  const tomorrow = addDays(dayStart(now), 1)
  const openAfterToday = events.filter((e) => e.kind === 'open' && e.start >= tomorrow).length
  const tz = browserTz()

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          className="mb-0 items-center"
          title="Calendar"
          subtitle="Your booked sessions and open slots in one place."
          actions={
            <Link href="/mentor/dashboard/availability" className={btn({ variant: 'secondary' })}>
              <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              Add availability
            </Link>
          }
        />

        <div className="grid grid-cols-1 items-start gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="h-cal" className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-ui-line px-4 py-3.5">
              <Button variant="secondary" size="sm" onClick={() => setSelected(dayStart(new Date()))}>Today</Button>
              <Button variant="secondary" size="icon" aria-label={view === 'week' ? 'Previous week' : 'Previous month'} onClick={() => step(-1)}>
                <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
              </Button>
              <Button variant="secondary" size="icon" aria-label={view === 'week' ? 'Next week' : 'Next month'} onClick={() => step(1)}>
                <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
              </Button>
              <span aria-hidden className="hidden basis-full max-sm:block" />
              <h2 id="h-cal" aria-live="polite" className="min-w-0 flex-1 text-base font-semibold text-ui-text">{title}</h2>
              <div role="group" aria-label="Calendar view" className="inline-flex gap-0.5 rounded-[10px] bg-ui-surface-2 p-[3px]">
                {(['week', 'month'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold capitalize transition-colors',
                      view === v ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,0.08)]' : 'text-ui-muted hover:text-ui-text',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-4"><Skeleton className="h-[560px]" /></div>
            ) : view === 'week' ? (
              <WeekView days={weekDays} byDay={byDay} now={now} todayKey={todayKey} selKey={selKey} onSelect={setSelected} tzLabel={tzAbbr(tz)} />
            ) : (
              <MonthView selected={selected} byDay={byDay} todayKey={todayKey} selKey={selKey} onSelect={setSelected} />
            )}
          </section>

          <aside className="grid grid-cols-1 items-start gap-4 md:max-[1359px]:grid-cols-2">
            <MiniMonth
              month={miniMonth}
              onMonth={setMiniMonth}
              todayKey={todayKey}
              selKey={selKey}
              byDay={byDay}
              onSelect={setSelected}
            />

            <section aria-labelledby="h-day" className="rounded-[14px] border border-ui-line bg-ui-surface">
              <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                <h2 id="h-day" className="text-[15px] font-semibold text-ui-text">{f(selected, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
                <span className="text-xs text-ui-muted">{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>
              </div>
              {dayItems.length === 0 ? (
                <p className="border-t border-ui-line px-4 py-3.5 text-[13px] text-ui-muted">Nothing on this day.</p>
              ) : (
                dayItems.map((e) => {
                  const joinable = e.kind === 'booked' && e.status === 'confirmed' && e.end > now && e.meetingLink
                  return (
                    <div key={e.id} className="flex gap-3 border-t border-ui-line px-4 py-3">
                      <span
                        aria-hidden
                        className={cn(
                          'w-1 shrink-0 rounded-sm',
                          e.kind === 'booked' && 'bg-ui-brand',
                          e.kind === 'open' && 'border border-dashed border-ui-brand',
                          e.kind === 'cancelled' && 'border border-ui-line bg-ui-surface-2',
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <strong className={cn('truncate text-sm font-semibold text-ui-text', e.kind === 'cancelled' && 'text-ui-muted line-through')}>{e.title}</strong>
                        <span className="text-[13px] text-ui-muted">
                          {time(e.start)} to {time(e.end)}
                          {e.kind === 'booked' && `, ${e.status}`}
                          {e.kind === 'cancelled' && ', cancelled'}
                          {e.kind === 'open' && e.end <= now && ', not booked'}
                        </span>
                      </span>
                      {joinable && (
                        <a href={e.meetingLink!} target="_blank" rel="noopener noreferrer" className={cn(btn({ size: 'sm' }), 'self-center')}>
                          <Video className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          Join
                        </a>
                      )}
                    </div>
                  )
                })
              )}
            </section>

            {!loading && openAfterToday === 0 && (
              <section aria-labelledby="h-empty" className="flex flex-col gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface p-4">
                <h2 id="h-empty" className="text-[15px] font-semibold text-ui-text">Nothing open after today</h2>
                <p className="text-[13px] text-ui-muted">Tomorrow onwards is empty, so mentees have no times to book.</p>
                <Link href="/mentor/dashboard/availability" className={btn({ size: 'sm' })}>
                  <CalendarPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Add availability
                </Link>
              </section>
            )}

            <div className="flex flex-col gap-2 px-1">
              <LegendRow swatch="bg-ui-brand">Booked session</LegendRow>
              <LegendRow swatch="border border-dashed border-ui-brand">Open slot</LegendRow>
              <LegendRow swatch="border border-ui-line bg-ui-surface-2">Cancelled</LegendRow>
            </div>
          </aside>
        </div>
      </div>
    </MentorLayout>
  )
}

// ---------------------------------------------------------------------------

function LegendRow({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ui-muted">
      <i aria-hidden className={cn('inline-block h-3.5 w-3.5 rounded', swatch)} />
      {children}
    </span>
  )
}

function evLabel(e: Ev) {
  const when = `${f(e.start, { weekday: 'long', day: 'numeric' })}, ${time(e.start)}`
  if (e.kind === 'booked') return `${when}, session with ${e.title}, ${e.status}`
  if (e.kind === 'cancelled') return `${when}, cancelled session with ${e.title}`
  return `${when}, open slot`
}

function WeekView({
  days,
  byDay,
  now,
  todayKey,
  selKey,
  onSelect,
  tzLabel,
}: {
  days: Date[]
  byDay: Map<string, Ev[]>
  now: Date
  todayKey: string
  selKey: string
  onSelect: (d: Date) => void
  tzLabel: string
}) {
  // Hour range: 07:00 to 21:00, widened to fit anything outside it this week.
  let startH = 7
  let endH = 21
  for (const d of days) {
    for (const e of byDay.get(localKey(d)) ?? []) {
      startH = Math.min(startH, e.start.getHours())
      const endKey = localKey(e.end)
      endH = Math.max(endH, endKey !== localKey(d) ? 24 : Math.ceil(e.end.getHours() + e.end.getMinutes() / 60))
    }
  }
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const colH = hours.length * ROW

  const yesterdayKey = localKey(addDays(dayStart(now), -1))
  const hideMobile = (d: Date) => localKey(d) < yesterdayKey
  const mcols = days.filter((d) => !hideMobile(d)).length
  const vars = { '--mcols': mcols, '--mmin': `${mcols > 5 ? 44 + mcols * 64 : 0}px` } as CSSProperties

  const nowMins = (now.getHours() - startH) * 60 + now.getMinutes()

  return (
    <div className="relative overflow-x-auto">
      <div
        style={vars}
        className="grid min-w-[640px] grid-cols-[56px_repeat(7,minmax(0,1fr))] max-md:min-w-[var(--mmin)] max-md:grid-cols-[44px_repeat(var(--mcols),minmax(0,1fr))]"
      >
        <span className="flex items-end justify-end border-b border-ui-line px-2 pb-2.5 text-[11px] text-ui-muted">{tzLabel}</span>
        {days.map((d) => {
          const k = localKey(d)
          const isToday = k === todayKey
          const past = k < todayKey
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={k === selKey}
              aria-label={f(d, { weekday: 'long', month: 'long', day: 'numeric' })}
              className={cn(
                'flex flex-col items-center gap-0.5 border-b border-l border-ui-line py-2.5 text-xs font-semibold text-ui-muted hover:bg-ui-bg',
                hideMobile(d) && 'max-md:hidden',
              )}
            >
              {f(d, { weekday: 'short' })}
              <strong
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-base',
                  isToday ? 'bg-ui-brand text-white' : past ? 'text-ui-muted' : 'text-ui-text',
                  !isToday && k === selKey && 'ring-2 ring-ui-brand',
                )}
              >
                {d.getDate()}
              </strong>
            </button>
          )
        })}

        <div className="flex flex-col" aria-hidden>
          {hours.map((h, i) => (
            <span key={h} className={cn('h-[52px] pr-2 text-right text-[11px] tabular-nums text-ui-muted', i === 0 ? 'pt-0.5' : '-translate-y-[7px]')}>
              {hh(h)}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const k = localKey(d)
          const isToday = k === todayKey
          const past = k < todayKey
          const placed = placeDay(byDay.get(k) ?? [])
          return (
            <div
              key={k}
              role="group"
              aria-label={f(d, { weekday: 'long', day: 'numeric' })}
              style={{ height: colH, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 51px, var(--color-ui-line) 51px 52px)' }}
              className={cn(
                'relative border-l border-ui-line',
                past && 'bg-ui-bg',
                isToday && 'bg-ui-brand-soft/45',
                hideMobile(d) && 'max-md:hidden',
              )}
            >
              {placed.map((e) => {
                const top = ((e.start.getHours() - startH) * 60 + e.start.getMinutes()) * (ROW / 60) + 2
                const mins = Math.max(30, (e.end.getTime() - e.start.getTime()) / 60000)
                const height = Math.min(mins * (ROW / 60) - 4, colH - top)
                const width = 100 / e.lanes
                const isPastOpen = e.kind === 'open' && e.end <= now
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-label={evLabel(e)}
                    onClick={() => onSelect(d)}
                    style={{ top, height, left: `calc(${e.lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
                    className={cn(
                      'absolute flex flex-col gap-px overflow-hidden rounded-lg px-2 py-1 text-left text-xs max-md:px-1',
                      e.kind === 'booked' && 'bg-ui-brand text-white',
                      e.kind === 'open' && !isPastOpen && 'border border-dashed border-ui-brand bg-ui-surface text-ui-brand-text',
                      // Past and never booked: muted, not faded, so it stays readable.
                      isPastOpen && 'border border-dashed border-ui-line bg-ui-surface text-ui-muted',
                      e.kind === 'cancelled' && 'bg-ui-surface-2 text-ui-muted',
                    )}
                  >
                    <strong className={cn('w-full truncate text-xs font-semibold max-md:text-[11px]', e.kind === 'cancelled' && 'line-through', e.kind === 'booked' && 'whitespace-normal leading-tight')}>
                      {e.kind === 'cancelled' ? 'Cancelled' : e.title}
                    </strong>
                    <span className="w-full truncate text-[11px] opacity-85 max-md:hidden">
                      {e.kind === 'cancelled' ? e.title : e.kind === 'open' && isPastOpen ? 'Not booked' : `${time(e.start)} to ${time(e.end)}`}
                    </span>
                  </button>
                )
              })}
              {isToday && nowMins >= 0 && nowMins <= hours.length * 60 && (
                <div
                  aria-label={`Now, ${time(now)}`}
                  role="img"
                  style={{ top: nowMins * (ROW / 60) }}
                  className="pointer-events-none absolute inset-x-0 h-0.5 bg-ui-brand before:absolute before:-left-[5px] before:-top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-ui-brand"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({
  selected,
  byDay,
  todayKey,
  selKey,
  onSelect,
}: {
  selected: Date
  byDay: Map<string, Ev[]>
  todayKey: string
  selKey: string
  onSelect: (d: Date) => void
}) {
  const cells = monthMatrix(selected.getFullYear(), selected.getMonth())
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-ui-line" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d} className="py-2 text-center text-xs font-semibold text-ui-muted">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const k = localKey(d)
          const inMonth = d.getMonth() === selected.getMonth()
          const items = byDay.get(k) ?? []
          const isToday = k === todayKey
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={k === selKey}
              aria-label={`${f(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${items.length} item${items.length === 1 ? '' : 's'}`}
              className={cn(
                'flex min-h-[64px] flex-col items-stretch gap-1 border-ui-line p-1.5 text-left transition-colors hover:bg-ui-bg sm:min-h-[104px] sm:p-2',
                i % 7 !== 0 && 'border-l',
                i >= 7 && 'border-t',
                !inMonth && 'bg-ui-bg',
                k === selKey && 'bg-ui-brand-soft/45',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold',
                  isToday ? 'bg-ui-brand text-white' : inMonth ? 'text-ui-text' : 'text-ui-muted',
                )}
              >
                {d.getDate()}
              </span>
              {/* Phone: dots. Larger: pills. */}
              {items.length > 0 && (
                <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden>
                  {items.slice(0, 4).map((e) => (
                    <i
                      key={e.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        e.kind === 'booked' && 'bg-ui-brand',
                        e.kind === 'open' && 'border border-ui-brand',
                        e.kind === 'cancelled' && 'bg-ui-line',
                      )}
                    />
                  ))}
                </span>
              )}
              <span className="hidden flex-col gap-1 sm:flex" aria-hidden>
                {items.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={cn(
                      'truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      e.kind === 'booked' && 'bg-ui-brand text-white',
                      e.kind === 'open' && 'border border-dashed border-ui-brand text-ui-brand-text',
                      e.kind === 'cancelled' && 'bg-ui-surface-2 text-ui-muted line-through',
                    )}
                  >
                    {time(e.start)} {e.kind === 'open' ? 'Open' : e.title}
                  </span>
                ))}
                {items.length > 3 && <span className="px-1 text-[11px] font-semibold text-ui-muted">+{items.length - 3} more</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MiniMonth({
  month,
  onMonth,
  todayKey,
  selKey,
  byDay,
  onSelect,
}: {
  month: Date
  onMonth: (d: Date) => void
  todayKey: string
  selKey: string
  byDay: Map<string, Ev[]>
  onSelect: (d: Date) => void
}) {
  const cells = monthMatrix(month.getFullYear(), month.getMonth())
  return (
    <section aria-labelledby="h-mon" className="flex flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <h2 id="h-mon" className="flex-1 text-[15px] font-semibold text-ui-text">{f(month, { month: 'long', year: 'numeric' })}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d} aria-hidden className="py-1 text-[11px] font-semibold text-ui-muted">{d}</span>
        ))}
        {cells.map((d) => {
          const k = localKey(d)
          const inMonth = d.getMonth() === month.getMonth()
          const has = (byDay.get(k)?.length ?? 0) > 0
          const sel = k === selKey
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={sel}
              aria-current={k === todayKey ? 'date' : undefined}
              aria-label={`${f(d, { weekday: 'long', month: 'long', day: 'numeric' })}${has ? ', has items' : ''}`}
              className={cn(
                'relative mx-auto inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] transition-colors',
                sel ? 'bg-ui-brand font-bold text-white' : 'hover:bg-ui-surface-2',
                !sel && (inMonth ? 'text-ui-text' : 'text-ui-muted'),
                !sel && k === todayKey && 'font-bold text-ui-brand-text ring-1 ring-ui-brand',
              )}
            >
              {d.getDate()}
              {has && <i aria-hidden className={cn('absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full', sel ? 'bg-white' : 'bg-ui-brand')} />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

