'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Globe, Lock, Plus, Repeat, Timer, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Button, Chip, PageHeader, Skeleton, inputClass } from '@/components/kit'
import {
  ConfirmModal,
  apiErrorMessage,
  browserTz,
  fetchMe,
  isHttpsUrl,
  tzAbbr,
  updateMe,
  type ConfirmState,
} from '@/components/mentor/mentorKit'
import { addSlots, bulkDeleteSlots, getMyAvailability, type Slot } from '@/lib/api/mentorAvailability'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Date helpers (browser local time: the grid creates slots in local time)
// ---------------------------------------------------------------------------

const BASE_HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 07:00 .. 20:00
/** Weekly repeat choices: 0 = only the selected times, N = also the same weekday and hour for the next N weeks. */
const REPEAT_OPTIONS = [0, 1, 2, 4, 8, 12] as const
/** Slots per POST. The API has no explicit cap, but this keeps each body far under the 100 kB JSON limit. */
const ADD_BATCH = 150

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const cellKey = (d: Date, hour: number) => `${localKey(d)}|${hour}`
/** "YYYY-MM-DD|H" key, shifted `weeks` weeks later, as a local Date at that hour. */
function keyToDate(key: string, weeks = 0) {
  const [dk, h] = key.split('|')
  const [y, m, d] = dk.split('-').map(Number)
  return new Date(y, m - 1, d + weeks * 7, Number(h))
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - dow)
  return x
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const fmtLocal = (d: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', o).format(new Date(d))
const slotLabel = (iso: string) =>
  `${fmtLocal(iso, { weekday: 'short', month: 'short', day: 'numeric' })}, ${fmtLocal(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} ${tzAbbr()}`

function weekTitle(start: Date) {
  const end = addDays(start, 6)
  const sameYear = start.getFullYear() === end.getFullYear()
  const a = fmtLocal(start, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  const b = fmtLocal(end, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${a} to ${b}`
}

function joinWords(items: string[]) {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

type CellState = 'past' | 'booked' | 'open' | 'remove' | 'sel' | 'rep' | 'skip' | 'free'
const SELECTABLE: ReadonlySet<CellState> = new Set(['free', 'sel', 'rep', 'skip'])

// ---------------------------------------------------------------------------

export default function Availability() {
  const [now, setNow] = useState(() => new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [upcomingSlots, setUpcomingSlots] = useState<Slot[]>([])
  const [pastSlots, setPastSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()) // "YYYY-MM-DD|H"
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())
  const [repeatWeeks, setRepeatWeeks] = useState<number>(0)
  const [excludedCells, setExcludedCells] = useState<Set<string>>(new Set()) // repeated times the mentor left out
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const [savedLink, setSavedLink] = useState<string | null>(null)
  const [meLoaded, setMeLoaded] = useState(false)

  const fetchData = useCallback(() => {
    return getMyAvailability()
      .then((d) => {
        setUpcomingSlots(d.upcoming)
        setPastSlots(d.past)
        setSelectedSlotIds((prev) => new Set([...prev].filter((id) => d.upcoming.some((s) => s.id === id && s.isAvailable))))
        setNow(new Date())
      })
      .catch(() => toast.error('Failed to load availability'))
  }, [])

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
    fetchMe()
      .then((u) => setSavedLink(u.meetingLink || null))
      .catch(() => {})
      .finally(() => setMeLoaded(true))
  }, [fetchData])

  const weekStart = useMemo(() => addDays(startOfWeek(now), weekOffset * 7), [now, weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const todayKey = localKey(now)

  // Existing upcoming slots by "date|hour" (local)
  const slotByCell = useMemo(() => {
    const m = new Map<string, Slot>()
    for (const s of upcomingSlots) {
      const d = new Date(s.startsAt)
      m.set(`${localKey(d)}|${d.getHours()}`, s)
    }
    return m
  }, [upcomingSlots])

  const hours = useMemo(() => {
    const set = new Set(BASE_HOURS)
    const wkKeys = new Set(days.map(localKey))
    for (const s of upcomingSlots) {
      const d = new Date(s.startsAt)
      if (wkKeys.has(localKey(d))) set.add(d.getHours())
    }
    return [...set].sort((a, b) => a - b)
  }, [days, upcomingSlots])

  // Every time the current selection would add: each selected cell, plus the
  // same weekday and hour for the next `repeatWeeks` weeks. Times that already
  // exist (open or booked) or have passed are skipped and counted, so the
  // mentor is told before adding.
  const plan = useMemo(() => {
    const pending = new Map<string, Date>()
    const seen = new Set<string>()
    const left = new Set<string>() // repeated times the mentor left out
    let existing = 0
    let passed = 0
    for (const key of selectedCells) {
      const hour = Number(key.split('|')[1])
      for (let w = 0; w <= repeatWeeks; w++) {
        const at = keyToDate(key, w)
        const k = cellKey(at, hour)
        if (seen.has(k)) continue
        seen.add(k)
        if (w > 0 && excludedCells.has(k) && !selectedCells.has(k)) {
          left.add(k)
          continue
        }
        if (slotByCell.has(k)) existing++
        else if (at <= now) passed++
        else pending.set(k, at)
      }
    }
    const list = [...pending].map(([key, at]) => ({ key, at })).sort((a, b) => a.at.getTime() - b.at.getTime())
    return { pending: list, keys: new Set(pending.keys()), left, existing, passed }
  }, [selectedCells, repeatWeeks, excludedCells, slotByCell, now])
  const pending = plan.pending

  function cellState(day: Date, hour: number): { state: CellState; slot?: Slot } {
    const key = cellKey(day, hour)
    const slot = slotByCell.get(key)
    if (slot) {
      if (!slot.isAvailable) return { state: 'booked', slot }
      return { state: selectedSlotIds.has(slot.id) ? 'remove' : 'open', slot }
    }
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour)
    if (at <= now) return { state: 'past' }
    if (selectedCells.has(key)) return { state: 'sel' }
    if (plan.keys.has(key)) return { state: 'rep' }
    return { state: plan.left.has(key) ? 'skip' : 'free' }
  }

  function toggleCell(day: Date, hour: number) {
    const { state, slot } = cellState(day, hour)
    if (state === 'open' || state === 'remove') {
      if (slot) toggleSlotId(slot.id)
      return
    }
    const key = cellKey(day, hour)
    if (state === 'rep') {
      // Leave this one repeated time out (e.g. a holiday).
      setExcludedCells((prev) => new Set(prev).add(key))
      return
    }
    if (state === 'skip') {
      // A repeated time the mentor left out: put it back.
      setExcludedCells((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }
    if (state !== 'free' && state !== 'sel') return
    setSelectedCells((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Selectable cells in a row or column, and whether they are all selected. */
  function groupInfo(cells: [Date, number][]) {
    const keys: string[] = []
    let allOn = true
    for (const [d, h] of cells) {
      const { state } = cellState(d, h)
      if (!SELECTABLE.has(state)) continue
      keys.push(cellKey(d, h))
      if (state !== 'sel') allOn = false
    }
    return { keys, allOn: keys.length > 0 && allOn }
  }

  /** Select every free hour in a row or column, or clear them when all are already selected. */
  function toggleGroup(cells: [Date, number][]) {
    const { keys, allOn } = groupInfo(cells)
    if (keys.length === 0) return
    setSelectedCells((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (allOn) next.delete(k)
        else next.add(k)
      }
      return next
    })
    if (!allOn) {
      setExcludedCells((prev) => {
        if (!keys.some((k) => prev.has(k))) return prev
        const next = new Set(prev)
        for (const k of keys) next.delete(k)
        return next
      })
    }
  }

  function clearSelection() {
    setSelectedCells(new Set())
    setExcludedCells(new Set())
  }

  function toggleSlotId(id: string) {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pendingSummary = useMemo(() => {
    const dayLabel = (d: Date) => fmtLocal(d, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
    const seen = new Map<string, string>()
    for (const p of pending) seen.set(localKey(p.at), dayLabel(p.at))
    const labels = [...seen.values()]
    if (labels.length <= 4) return `${joinWords(labels)}.`
    return `${plural(labels.length, 'day')} from ${labels[0]} to ${labels[labels.length - 1]}.`
  }, [pending])

  const skipped = plan.existing + plan.passed
  const candidates = pending.length + skipped
  let skipNotice = ''
  if (skipped > 0) {
    const one = skipped === 1
    const who = candidates === 1 ? 'This time' : pending.length === 0 ? `All ${candidates} of these times` : `${skipped} of these ${candidates} times`
    const sing = candidates === 1 || (one && pending.length > 0)
    if (plan.passed === 0) skipNotice = `${who} ${sing ? 'is' : 'are'} already open or booked and will be skipped.`
    else if (plan.existing === 0) skipNotice = `${who} ${sing ? 'has' : 'have'} already passed and will be skipped.`
    else skipNotice = `${who} will be skipped: ${plan.existing} already open or booked, ${plan.passed} already passed.`
  }

  async function handleAdd() {
    if (pending.length === 0 || adding) return
    setAdding(true)
    let added = 0
    let dupes = 0
    try {
      for (let i = 0; i < pending.length; i += ADD_BATCH) {
        const cutoff = new Date()
        const chunk = pending.slice(i, i + ADD_BATCH).filter((p) => p.at > cutoff)
        if (chunk.length === 0) continue
        try {
          const data = await addSlots(chunk.map((p) => ({ startsAt: p.at.toISOString() })))
          added += data.slots.length
          dupes += data.skippedDuplicates ?? 0
        } catch (err) {
          // 409: every time in this batch already exists (e.g. added in another tab).
          if ((err as { status?: number })?.status === 409) {
            dupes += chunk.length
            continue
          }
          throw err
        }
      }
      const tail = dupes > 0 ? ` ${dupes} already existed and ${dupes === 1 ? 'was' : 'were'} skipped.` : ''
      if (added > 0) toast.success(`${plural(added, 'slot')} added.${tail}`)
      else toast.info(`No new slots added.${tail}`)
      clearSelection()
      setRepeatWeeks(0)
    } catch (err) {
      const msg = apiErrorMessage(err, 'Failed to add slots')
      // Batches already sent stay added; the refresh below marks them as open,
      // so trying again only sends what is still missing.
      toast.error(added > 0 ? `${plural(added, 'slot')} added, then adding stopped: ${msg}` : msg)
    } finally {
      await fetchData()
      setAdding(false)
    }
  }

  const deletable = upcomingSlots.filter((s) => s.isAvailable)
  const allSelected = deletable.length > 0 && deletable.every((s) => selectedSlotIds.has(s.id))

  function handleBulkDelete() {
    const ids = [...selectedSlotIds]
    if (ids.length === 0) return
    setConfirm({
      title: `Delete ${ids.length} slot${ids.length !== 1 ? 's' : ''}`,
      message: `This will permanently remove ${ids.length} availability slot${ids.length !== 1 ? 's' : ''}. Any mentee who already viewed these times will no longer be able to book them.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        setConfirm(null)
        setDeleting(true)
        bulkDeleteSlots(ids)
          .then(({ deleted }) => {
            toast.success(`${deleted} slot${deleted !== 1 ? 's' : ''} deleted`)
            setSelectedSlotIds(new Set())
            return fetchData()
          })
          .catch((err) => toast.error(apiErrorMessage(err, 'Failed to delete slots')))
          .finally(() => setDeleting(false))
      },
    })
  }

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const openAfterToday = upcomingSlots.filter((s) => s.isAvailable && new Date(s.startsAt) >= endOfToday).length
  const tz = browserTz()

  const dayIsPast = (d: Date) => localKey(d) < todayKey
  const mobileCols = days.filter((d) => !dayIsPast(d)).length
  const gridVars = {
    '--cols': 7,
    '--mcols': mobileCols,
    '--mmin': `${mobileCols > 4 ? 44 + mobileCols * 72 : 0}px`,
  } as CSSProperties

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          className="mb-0"
          title="Availability"
          subtitle="Open the times when mentees can book a session with you. Each slot is one hour."
        />

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Week grid */}
          <section aria-labelledby="h-week" className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-ui-line px-4 py-3.5">
              <Button variant="secondary" size="icon" aria-label="Previous week" disabled={weekOffset === 0} onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}>
                <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
              </Button>
              <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
                <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
              </Button>
              <h2 id="h-week" className="min-w-0 flex-1 text-base font-semibold text-ui-text" aria-live="polite">{weekTitle(weekStart)}</h2>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ui-muted">
                <Globe className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {tzAbbr(tz)}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-3.5 gap-y-2 px-4 pt-3">
              <Legend swatch="border-ui-brand bg-ui-brand">Selected</Legend>
              <Legend swatch="border-dashed border-ui-brand bg-ui-brand-soft">Already added</Legend>
              <Legend swatch="border-ui-line bg-ui-surface-2">Booked</Legend>
              <Legend swatch="border-transparent bg-[repeating-linear-gradient(135deg,var(--color-ui-surface-2)_0_3px,var(--color-ui-bg)_3px_6px)]">Time passed</Legend>
              <Legend swatch="border-ui-line bg-ui-surface">Available to add</Legend>
              {repeatWeeks > 0 && <Legend swatch="border-ui-brand bg-ui-brand-soft">Weekly repeat</Legend>}
            </div>
            {mobileCols < 7 && <p className="mx-4 mt-2 text-xs text-ui-muted md:hidden">Past days are hidden on small screens.</p>}

            <div className="overflow-x-auto px-4 pb-4 pt-2">
              {loading ? (
                <Skeleton className="h-[460px]" />
              ) : (
                <div
                  role="group"
                  aria-label="Pick one hour slots"
                  style={gridVars}
                  className="grid min-w-[600px] grid-cols-[52px_repeat(var(--cols),minmax(0,1fr))] gap-1 max-md:min-w-[var(--mmin)] max-md:grid-cols-[44px_repeat(var(--mcols),minmax(0,1fr))]"
                >
                  <span />
                  {days.map((d) => {
                    const k = localKey(d)
                    const isToday = k === todayKey
                    const past = dayIsPast(d)
                    const col = hours.map((h) => [d, h] as [Date, number])
                    const { keys, allOn } = groupInfo(col)
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={keys.length === 0}
                        aria-pressed={keys.length === 0 ? undefined : allOn}
                        aria-label={`Select every free hour on ${fmtLocal(d, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                        title={keys.length === 0 ? undefined : allOn ? 'Clear this day' : 'Select this whole day'}
                        onClick={() => toggleGroup(col)}
                        className={cn(
                          'flex flex-col items-center gap-0.5 rounded-[10px] pb-2 pt-1.5 text-xs font-semibold text-ui-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand disabled:cursor-default',
                          keys.length > 0 && 'hover:bg-ui-surface-2 hover:text-ui-text',
                          allOn && 'bg-ui-brand-soft text-ui-brand-text hover:bg-ui-brand-soft hover:text-ui-brand-text',
                          past && 'max-md:hidden',
                        )}
                      >
                        {fmtLocal(d, { weekday: 'short' })}
                        <strong
                          className={cn(
                            'text-base',
                            isToday ? 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-ui-brand text-white' : past ? 'text-ui-muted' : 'text-ui-text',
                          )}
                        >
                          {d.getDate()}
                        </strong>
                      </button>
                    )
                  })}
                  {hours.map((h) => {
                    const row = days.map((d) => [d, h] as [Date, number])
                    const { keys, allOn } = groupInfo(row)
                    return [
                    <button
                      key={`h-${h}`}
                      type="button"
                      disabled={keys.length === 0}
                      aria-pressed={keys.length === 0 ? undefined : allOn}
                      aria-label={`Select ${hh(h)} on every free day this week`}
                      title={keys.length === 0 ? undefined : allOn ? 'Clear this hour' : 'Select this hour all week'}
                      onClick={() => toggleGroup(row)}
                      className={cn(
                        'flex items-center justify-end rounded-[7px] pe-1.5 text-[11px] tabular-nums text-ui-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand disabled:cursor-default',
                        keys.length > 0 && 'hover:bg-ui-surface-2 hover:text-ui-text',
                        allOn && 'bg-ui-brand-soft font-semibold text-ui-brand-text hover:bg-ui-brand-soft hover:text-ui-brand-text',
                      )}
                    >
                      {hh(h)}
                    </button>,
                    ...days.map((d) => {
                      const { state } = cellState(d, h)
                      const label = `${fmtLocal(d, { weekday: 'long', day: 'numeric' })}, ${hh(h)}`
                      return (
                        <GridCell
                          key={`${localKey(d)}-${h}`}
                          state={state}
                          label={label}
                          hideOnMobile={dayIsPast(d)}
                          onClick={() => toggleCell(d, h)}
                        />
                      )
                    }),
                    ]
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-ui-line bg-ui-bg px-4 py-3.5">
              <div className="flex flex-col items-stretch gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-live="polite">
                  <strong className="text-sm font-semibold text-ui-text">
                    {pending.length === 0 ? 'No new slots selected' : `${plural(pending.length, 'new slot')} to add`}
                  </strong>
                  <span className="text-xs text-ui-muted">
                    {pending.length === 0
                      ? 'Click empty hours to select them, or a day or hour heading to select a whole column or row. Click an open slot to select it for removal.'
                      : repeatWeeks > 0
                        ? `${pendingSummary} Repeats weekly; click a repeated time to leave it out.`
                        : pendingSummary}
                  </span>
                  {skipNotice && (
                    <span className="mt-1 flex gap-1.5 text-xs leading-snug text-ui-brand-text">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      {skipNotice}
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-1">
                  <label className="me-auto flex items-center gap-2 text-[13px] font-semibold text-ui-text max-sm:basis-full">
                    <Repeat className="h-4 w-4 shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
                    <span className="whitespace-nowrap">Repeat weekly</span>
                    <select
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                      className={cn(inputClass, 'w-auto min-w-0 cursor-pointer font-medium max-sm:flex-1')}
                    >
                      {REPEAT_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n === 0 ? 'This week only' : `Next ${plural(n, 'week')}`}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" disabled={selectedCells.size === 0 || adding} onClick={clearSelection}>
                    Clear
                  </Button>
                  <Button disabled={pending.length === 0 || adding} onClick={handleAdd}>
                    <Plus className="h-[18px] w-[18px]" aria-hidden />
                    {adding ? 'Adding' : pending.length > 0 ? `Add ${plural(pending.length, 'slot')}` : 'Add slots'}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <BookingSettings
              loaded={meLoaded}
              savedLink={savedLink}
              tz={tz}
              onSaved={(v) => setSavedLink(v)}
            />

            <section aria-labelledby="h-slots" className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <h2 id="h-slots" className="text-base font-semibold text-ui-text">
                  Upcoming slots <span className="font-medium text-ui-muted">{upcomingSlots.length}</span>
                </h2>
                {deletable.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedSlotIds(allSelected ? new Set() : new Set(deletable.map((s) => s.id)))}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </Button>
                )}
              </div>
              {loading ? (
                <div className="flex flex-col gap-2 border-t border-ui-line p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
              ) : upcomingSlots.length === 0 ? (
                <p className="border-t border-ui-line px-4 py-4 text-[13px] text-ui-muted">No upcoming slots. Select times in the week grid to add some.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  {upcomingSlots.map((s) =>
                    s.isAvailable ? (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2.5 border-t border-ui-line px-4 py-2.5 text-[13px] text-ui-text hover:bg-ui-bg">
                        <input
                          type="checkbox"
                          checked={selectedSlotIds.has(s.id)}
                          onChange={() => toggleSlotId(s.id)}
                          className="h-4 w-4 shrink-0 accent-ui-brand"
                        />
                        <span className="flex-1">{slotLabel(s.startsAt)}</span>
                        <Chip tone="brand" className="rounded-full">Available</Chip>
                      </label>
                    ) : (
                      <div key={s.id} className="flex items-center gap-2.5 border-t border-ui-line px-4 py-2.5 text-[13px] text-ui-text">
                        <span className="w-4 shrink-0" />
                        <span className="flex-1">{slotLabel(s.startsAt)}</span>
                        <Chip className="rounded-full"><Lock className="h-3 w-3" aria-hidden />Booked</Chip>
                      </div>
                    ),
                  )}
                </div>
              )}
              {!loading && openAfterToday === 0 && (
                <div className="flex flex-col gap-1 border-t border-ui-line bg-ui-bg px-4 py-3.5">
                  <strong className="text-[13px] font-semibold text-ui-text">Nothing open after today</strong>
                  <span className="text-xs text-ui-muted">Select times in the week grid and add them so mentees can book you.</span>
                </div>
              )}
              {deletable.length > 0 && (
                <div className="flex items-center justify-between gap-2.5 border-t border-ui-line px-4 py-3">
                  <span className="text-xs text-ui-muted">{selectedSlotIds.size} of {deletable.length} selected</span>
                  <Button variant="secondary" size="sm" disabled={selectedSlotIds.size === 0 || deleting} onClick={handleBulkDelete}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {deleting ? 'Deleting' : 'Delete selected'}
                  </Button>
                </div>
              )}
              <button
                type="button"
                aria-expanded={pastOpen}
                aria-controls="past-slots"
                onClick={() => setPastOpen((o) => !o)}
                className="flex w-full items-center justify-between border-t border-ui-line px-4 py-3 text-[13px] font-semibold text-ui-muted hover:text-ui-text"
              >
                Past slots ({pastSlots.length})
                <ChevronDown className={cn('h-4 w-4 transition-transform', pastOpen && 'rotate-180')} aria-hidden />
              </button>
              {pastOpen && (
                <div id="past-slots" className="max-h-[280px] overflow-y-auto">
                  {pastSlots.length === 0 ? (
                    <p className="border-t border-ui-line px-4 py-3 text-xs text-ui-muted">No past slots.</p>
                  ) : (
                    pastSlots.map((s) => (
                      <div key={s.id} className="flex items-center gap-2.5 border-t border-ui-line px-4 py-2.5 text-[13px] text-ui-muted">
                        <span className="flex-1">{slotLabel(s.startsAt)}</span>
                        <Chip className="rounded-full">{s.isAvailable ? 'Not booked' : 'Booked'}</Chip>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          cancelLabel="Keep slots"
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </MentorLayout>
  )
}

// ---------------------------------------------------------------------------

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ui-muted">
      <i aria-hidden className={cn('inline-block h-3.5 w-3.5 rounded border', swatch)} />
      {children}
    </span>
  )
}

function GridCell({ state, label, hideOnMobile, onClick }: { state: CellState; label: string; hideOnMobile: boolean; onClick: () => void }) {
  const disabled = state === 'past' || state === 'booked'
  const suffix = {
    past: ', time passed',
    booked: ', booked',
    open: ', open slot. Select to remove',
    remove: ', open slot selected for removal',
    sel: ', selected',
    rep: ', added by weekly repeat. Select to leave it out',
    skip: ', repeated time left out. Select to add it back',
    free: '',
  }[state]
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={disabled ? undefined : state === 'sel' || state === 'rep' || state === 'remove'}
      aria-label={label + suffix}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center justify-center gap-1 rounded-[7px] border p-0 text-[11px] font-semibold transition-colors',
        hideOnMobile && 'max-md:hidden',
        state === 'free' && 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2',
        state === 'past' && 'cursor-not-allowed border-transparent bg-[repeating-linear-gradient(135deg,var(--color-ui-surface-2)_0_4px,var(--color-ui-bg)_4px_8px)]',
        state === 'booked' && 'cursor-not-allowed border-ui-line bg-ui-surface-2 text-ui-muted',
        state === 'open' && 'border-dashed border-ui-brand bg-ui-brand-soft text-ui-brand-text hover:brightness-95',
        state === 'remove' && 'border-ui-danger bg-ui-danger-soft text-ui-danger',
        state === 'sel' && 'border-ui-brand bg-ui-brand text-white',
        state === 'rep' && 'border-ui-brand bg-ui-brand-soft text-ui-brand-text hover:brightness-95',
        state === 'skip' && 'border-dashed border-ui-line bg-ui-surface text-ui-muted hover:bg-ui-surface-2',
      )}
    >
      {state === 'booked' && (<><Lock className="h-3 w-3" aria-hidden />Booked</>)}
      {state === 'open' && (<><Check className="h-3 w-3" aria-hidden />Open</>)}
      {state === 'remove' && (<><X className="h-3 w-3" aria-hidden />Remove</>)}
      {state === 'sel' && (<><Plus className="h-3 w-3" aria-hidden />New</>)}
      {state === 'rep' && (<><Repeat className="h-3 w-3" aria-hidden />Repeat</>)}
      {state === 'skip' && (<><X className="h-3 w-3" aria-hidden />Skipped</>)}
    </button>
  )
}

function BookingSettings({
  loaded,
  savedLink,
  tz,
  onSaved,
}: {
  loaded: boolean
  savedLink: string | null
  tz: string
  onSaved: (v: string | null) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(savedLink ?? ''), [savedLink])

  const missing = loaded && !savedLink
  const dirty = value.trim() !== (savedLink ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = value.trim()
    if (v && !isHttpsUrl(v)) {
      setError('Enter a full link that starts with https://')
      return
    }
    setSaving(true)
    updateMe({ meetingLink: v || null })
      .then((u) => {
        onSaved(u.meetingLink || null)
        toast.success(v ? 'Meeting link saved' : 'Meeting link removed')
      })
      .catch((err) => setError(apiErrorMessage(err, 'Could not save settings')))
      .finally(() => setSaving(false))
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="h-set" className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-[18px]">
      <h2 id="h-set" className="text-base font-semibold text-ui-text">Booking settings</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-link" className="text-[13px] font-semibold text-ui-text">Meeting link</label>
        <input
          id="a-link"
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError('')
          }}
          placeholder="https://zoom.us/j/your-room"
          aria-invalid={!!error}
          aria-describedby="a-link-h"
          className={cn(inputClass, (missing || error) && 'border-ui-brand')}
        />
        {error ? (
          <span id="a-link-h" role="alert" className="text-xs text-ui-danger">{error}</span>
        ) : missing ? (
          <span id="a-link-h" className="flex gap-1.5 text-xs leading-snug text-ui-brand-text">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Add a meeting link before mentees can book sessions. Mentees join with this link.
          </span>
        ) : (
          <span id="a-link-h" className="text-xs text-ui-muted">Mentees join your sessions with this link.</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ui-text">Session length</span>
        <span className="flex min-h-10 items-center gap-2 rounded-[10px] bg-ui-surface-2 px-3 text-sm text-ui-text">
          <Timer className="h-4 w-4 text-ui-muted" strokeWidth={1.75} aria-hidden />
          1 hour
        </span>
        <span className="text-xs text-ui-muted">Every slot you add is one hour long.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ui-text">Timezone</span>
        <span className="flex min-h-10 items-center gap-2 rounded-[10px] bg-ui-surface-2 px-3 text-sm text-ui-text">
          <Globe className="h-4 w-4 text-ui-muted" strokeWidth={1.75} aria-hidden />
          {tz} <span className="text-ui-muted">({tzAbbr(tz)})</span>
        </span>
        <span className="text-xs text-ui-muted">Detected from your browser. Mentees see times in their own timezone.</span>
      </div>
      <Button type="submit" variant="secondary" disabled={!loaded || !dirty || saving}>
        {saving ? 'Saving' : 'Save settings'}
      </Button>
    </form>
  )
}
