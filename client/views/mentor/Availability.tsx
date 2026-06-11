'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Trash2,
  Plus,
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Slot {
  id: string
  startsAt: string
  endsAt: string
  isAvailable: boolean
}

interface AvailabilityData {
  upcoming: Slot[]
  past: Slot[]
}

interface MeData {
  success: boolean
  data: { user: { meetingLink: string | null } }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayKey(): string {
  return toDateKey(new Date())
}

function formatSlotTime(isoString: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(isoString))
}

function formatHour(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7..20

// ---------------------------------------------------------------------------
// Calendar component
// ---------------------------------------------------------------------------

function MiniCalendar({
  year,
  month,
  selectedDates,
  slotDates,
  onToggleDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number
  month: number
  selectedDates: Set<string>
  slotDates: Set<string>
  onToggleDate: (key: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const today = todayKey()
  const now = new Date()
  const isPrevDisabled = year === now.getFullYear() && month === now.getMonth()

  // First day of this month
  const firstDay = new Date(year, month, 1)
  // Day of week for first day (0=Sun..6=Sat) → convert to Mon-based (0=Mon..6=Sun)
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<{ key: string; day: number } | null> = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1)
      return { key: toDateKey(d), day: i + 1 }
    }),
  ]

  // Pad to full weeks
  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push(null)
  }

  return (
    <div className="rounded-2xl bg-white border border-brand-surface-2 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-surface-2">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={isPrevDisabled}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isPrevDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-brand-surface'}`}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-brand-text-secondary" />
        </button>
        <span className="text-sm font-bold text-brand-text-primary">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="w-8 h-8 rounded-lg hover:bg-brand-surface flex items-center justify-center transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-brand-text-secondary" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center px-3 pt-3">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wide py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid — cells fill column width via aspect-square */}
      <div className="grid grid-cols-7 gap-1 px-3 pb-4">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="aspect-square" />
          }

          const isPast = cell.key < today
          const isToday = cell.key === today
          const isSelected = selectedDates.has(cell.key)
          const hasSlots = slotDates.has(cell.key)

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isPast}
              onClick={() => !isPast && onToggleDate(cell.key)}
              className={[
                'relative w-full aspect-square rounded-full text-sm font-medium transition-all flex flex-col items-center justify-center',
                isPast
                  ? 'opacity-30 cursor-not-allowed text-brand-text-muted'
                  : isSelected
                    ? 'bg-brand-primary text-white shadow-md'
                    : isToday
                      ? 'ring-2 ring-brand-primary text-brand-primary font-bold hover:bg-brand-primary/10'
                      : 'text-brand-text-primary hover:bg-brand-surface cursor-pointer',
              ].join(' ')}
              aria-label={`${cell.key}${isPast ? ' (past)' : ''}`}
            >
              {cell.day}
              {hasSlots && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slot row
// ---------------------------------------------------------------------------

function SlotRow({
  slot,
  selectable,
  selected,
  onToggle,
  isPast,
}: {
  slot: Slot
  selectable: boolean
  selected: boolean
  onToggle?: (id: string) => void
  isPast?: boolean
}) {
  const booked = !slot.isAvailable
  return (
    <div className={`flex items-center gap-3 py-2.5 border-b border-brand-surface-2 last:border-0 ${isPast ? 'opacity-50' : ''}`}>
      {selectable && !booked && onToggle ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(slot.id)}
          className="w-4 h-4 rounded border-brand-surface-2 accent-brand-primary flex-shrink-0"
        />
      ) : (
        <div className="w-4 h-4 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-brand-text-primary">{formatSlotTime(slot.startsAt)}</p>
      </div>
      {booked ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
          <Lock className="w-3 h-3" />
          Booked
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Available
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-text-muted hover:text-brand-text-primary transition-colors"
      >
        <span>{title} ({count})</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function Availability() {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [selectedTimes, setSelectedTimes] = useState<Set<number>>(new Set())

  const [upcomingSlots, setUpcomingSlots] = useState<Slot[]>([])
  const [pastSlots, setPastSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [hasMeetingLink, setHasMeetingLink] = useState(true)

  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    variant: 'danger' | 'default'
    onConfirm: () => void
  } | null>(null)

  // Dates that already have slots (for calendar dot indicator)
  const slotDates = new Set(upcomingSlots.map((s) => toDateKey(new Date(s.startsAt))))

  // Map from dateKey → Set<localHour> for time-picker conflict detection
  const takenHoursMap = new Map<string, Set<number>>()
  for (const slot of upcomingSlots) {
    const d = new Date(slot.startsAt)
    const dk = toDateKey(d)
    const hr = d.getHours()
    if (!takenHoursMap.has(dk)) takenHoursMap.set(dk, new Set())
    takenHoursMap.get(dk)!.add(hr)
  }

  // Select-all helpers — only unbooked upcoming slots can be selected/deleted
  const deletableSlots = upcomingSlots.filter((s) => s.isAvailable)
  const allDeletableSelected =
    deletableSlots.length > 0 && deletableSlots.every((s) => selectedSlotIds.has(s.id))

  function toggleSelectAll() {
    if (allDeletableSelected) {
      setSelectedSlotIds(new Set())
    } else {
      setSelectedSlotIds(new Set(deletableSlots.map((s) => s.id)))
    }
  }

  const fetchData = useCallback(() => {
    setLoadingSlots(true)
    Promise.all([
      apiFetch<AvailabilityData>('/api/mentor/availability'),
      apiFetch<MeData>('/api/auth/me'),
    ])
      .then(([availData, meData]) => {
        setUpcomingSlots(availData.upcoming)
        setPastSlots(availData.past)
        setHasMeetingLink(!!meData.data?.user?.meetingLink)
        setLoadingSlots(false)
      })
      .catch(() => {
        toast.error('Failed to load availability')
        setLoadingSlots(false)
      })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleDate(key: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleTime(hour: number) {
    setSelectedTimes((prev) => {
      const next = new Set(prev)
      if (next.has(hour)) next.delete(hour)
      else next.add(hour)
      return next
    })
  }

  function toggleSlotId(id: string) {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAddSlots() {
    if (selectedDates.size === 0 || selectedTimes.size === 0) return
    const cutoff = new Date()
    const slots: { startsAt: string }[] = []
    for (const dateKey of selectedDates) {
      for (const hour of selectedTimes) {
        const [y, m, d] = dateKey.split('-').map(Number)
        // Use local time so the displayed hour matches what gets stored
        const localDate = new Date(y!, m! - 1, d!, hour, 0, 0, 0)
        if (localDate <= cutoff) continue
        slots.push({ startsAt: localDate.toISOString() })
      }
    }
    if (slots.length === 0) {
      toast.error('All selected times are in the past — pick a future time slot')
      return
    }
    setAdding(true)
    apiFetch<{ slots: Slot[]; skippedDuplicates: number }>('/api/mentor/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
    })
      .then((data) => {
        const added = data.slots.length
        const skipped = data.skippedDuplicates ?? 0
        const msg = skipped > 0
          ? `${added} slot${added !== 1 ? 's' : ''} added · ${skipped} already existed (skipped)`
          : `${added} slot${added !== 1 ? 's' : ''} added`
        toast.success(msg)
        setSelectedDates(new Set())
        setSelectedTimes(new Set())
        fetchData()
      })
      .catch((err: { error?: { message?: string } }) => {
        toast.error(err?.error?.message ?? 'Failed to add slots')
      })
      .finally(() => setAdding(false))
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedSlotIds)
    if (ids.length === 0) return
    setConfirmDialog({
      title: `Delete ${ids.length} slot${ids.length !== 1 ? 's' : ''}`,
      message: `This will permanently remove ${ids.length} availability slot${ids.length !== 1 ? 's' : ''}. Any mentee who already viewed these times will no longer be able to book them.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        setDeleting(true)
        apiFetch<{ deleted: number; skipped: number }>('/api/mentor/availability/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
          .then(({ deleted }) => {
            toast.success(`${deleted} slot${deleted !== 1 ? 's' : ''} deleted`)
            setSelectedSlotIds(new Set())
            fetchData()
          })
          .catch((err: { error?: { message?: string } }) => {
            toast.error(err?.error?.message ?? 'Failed to delete slots')
          })
          .finally(() => setDeleting(false))
      },
    })
  }

  function prevMonth() {
    const current = new Date()
    if (viewYear === current.getFullYear() && viewMonth === current.getMonth()) return
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzAbbr =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? ''

  // Count slots that would actually be submitted (future + non-duplicate)
  // and partial conflicts where the selected hour is taken on some (but not all) dates
  let validSlotCount = 0
  let partialConflictCount = 0
  for (const dk of selectedDates) {
    const [y, m, d] = dk.split('-').map(Number)
    for (const hour of selectedTimes) {
      const localDate = new Date(y!, m! - 1, d!, hour, 0, 0, 0)
      if (localDate <= now) continue
      if (takenHoursMap.get(dk)?.has(hour)) {
        partialConflictCount++
        continue
      }
      validSlotCount++
    }
  }

  return (
    <>
    <MentorLayout>
      <PageHeader
        eyebrow="Mentor"
        title="Manage"
        highlight="Availability"
        subtitle="Set the times when mentees can book sessions with you."
      />

      <p className="text-xs text-brand-text-muted mb-6">
        Times shown in your timezone ({localTz} — {tzAbbr})
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Calendar */}
        <div>
          <MiniCalendar
            year={viewYear}
            month={viewMonth}
            selectedDates={selectedDates}
            slotDates={slotDates}
            onToggleDate={toggleDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
          {selectedDates.size > 0 && (
            <p className="mt-2 text-xs text-brand-text-muted text-center">
              {selectedDates.size} date{selectedDates.size !== 1 ? 's' : ''} selected — pick time slots on the right
            </p>
          )}
        </div>

        {/* Right: Manage panel */}
        <div className="space-y-4">
          {/* Meeting link warning */}
          {!hasMeetingLink && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Add a meeting link in your profile before SMEs can book sessions.{' '}
                <Link href="/mentor/dashboard/profile" className="font-bold underline">
                  Go to Profile →
                </Link>
              </span>
            </div>
          )}

          {/* Add slots section */}
          <AnimatePresence>
            {selectedDates.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl bg-white border border-brand-primary/30 shadow-sm p-5"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-3">
                  Add slots for selected {selectedDates.size} date{selectedDates.size !== 1 ? 's' : ''}
                </p>

                {/* Color legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                  {[
                    { color: 'bg-brand-primary border-brand-primary', label: 'Selected' },
                    { color: 'bg-brand-surface border-brand-surface-2', label: 'Available' },
                    { color: 'bg-emerald-50 border-emerald-200', label: 'Already added' },
                    { color: 'bg-amber-50 border-amber-300', label: 'Partial conflict' },
                    { color: 'bg-brand-surface border-brand-surface-2 opacity-30', label: 'Time passed' },
                  ].map(({ color, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-brand-text-muted">
                      <span className={`w-3 h-3 rounded-sm border flex-shrink-0 ${color}`} />
                      {label}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
                  {HOURS.map((hour) => {
                    const active = selectedTimes.has(hour)
                    const todayKey_ = todayKey()
                    const todaySelected = selectedDates.has(todayKey_)
                    const isPast = (() => {
                      if (!todaySelected) return false
                      const [y, m, d] = todayKey_.split('-').map(Number)
                      return new Date(y!, m! - 1, d!, hour, 0, 0, 0) <= now
                    })()
                    const selectedArr = Array.from(selectedDates)
                    const takenCount = selectedArr.filter((dk) => takenHoursMap.get(dk)?.has(hour)).length
                    const takenForAll = selectedArr.length > 0 && takenCount === selectedArr.length
                    const takenForSome = takenCount > 0 && !takenForAll
                    const disabled = isPast || takenForAll
                    return (
                      <button
                        key={hour}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && toggleTime(hour)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all border ${
                          isPast
                            ? 'opacity-30 cursor-not-allowed bg-brand-surface text-brand-text-muted border-brand-surface-2'
                            : takenForAll
                              ? 'opacity-50 cursor-not-allowed bg-emerald-50 text-emerald-700 border-emerald-200'
                              : active && takenForSome
                                ? 'bg-amber-500 text-white shadow-sm border-amber-500'
                                : active
                                  ? 'bg-brand-primary text-white shadow-sm border-brand-primary'
                                  : takenForSome
                                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                    : 'bg-brand-surface text-brand-text-secondary hover:bg-brand-surface-2 hover:text-brand-text-primary border-brand-surface-2'
                        }`}
                      >
                        {formatHour(hour)}
                      </button>
                    )
                  })}
                </div>

                {/* Helper text — visible below the grid, context-sensitive */}
                <div className="space-y-1.5 mb-4">
                  {partialConflictCount > 0 && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>{partialConflictCount} time slot{partialConflictCount !== 1 ? 's' : ''}</strong> already exist on some of your selected dates and will be skipped — only new slots will be created.
                      </span>
                    </p>
                  )}
                  {selectedTimes.size > 0 && validSlotCount === 0 && (
                    <p className="flex items-start gap-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      All selected times are either in the past or already exist — pick different slots.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={validSlotCount === 0 || adding}
                  onClick={handleAddSlots}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  {adding
                    ? 'Adding...'
                    : `Add ${validSlotCount || ''} Slot${validSlotCount !== 1 ? 's' : ''}`}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Slots viewer */}
          <div className="rounded-2xl bg-white border border-brand-surface-2 shadow-sm p-5">
            {/* Toolbar — visible whenever there are deletable upcoming slots */}
            {deletableSlots.length > 0 && (
              <div className="flex items-center justify-between mb-3 px-1">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs font-bold text-brand-primary hover:text-brand-primary-dark transition-colors"
                >
                  {allDeletableSelected ? 'Deselect All' : 'Select All'}
                </button>
                <div className="flex items-center gap-3">
                  {selectedSlotIds.size > 0 && (
                    <span className="text-xs text-brand-text-muted">
                      {selectedSlotIds.size} of {deletableSlots.length} selected
                    </span>
                  )}
                  {selectedSlotIds.size > 0 && (
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleBulkDelete}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deleting ? 'Deleting...' : 'Delete Selected'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {loadingSlots ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-brand-surface animate-pulse" />
                ))}
              </div>
            ) : upcomingSlots.length === 0 && pastSlots.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-center">
                <CalendarCheck className="w-10 h-10 text-brand-text-muted mb-2 opacity-40" />
                <p className="text-sm font-semibold text-brand-text-secondary">No slots yet.</p>
                <p className="text-xs text-brand-text-muted mt-1">
                  Select dates on the calendar and add time slots.
                </p>
              </div>
            ) : (
              <>
                {upcomingSlots.length > 0 && (
                  <CollapsibleSection title="Upcoming Slots" count={upcomingSlots.length} defaultOpen>
                    {upcomingSlots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        selectable={true}
                        selected={selectedSlotIds.has(slot.id)}
                        onToggle={slot.isAvailable ? toggleSlotId : undefined}
                      />
                    ))}
                  </CollapsibleSection>
                )}
                {pastSlots.length > 0 && (
                  <CollapsibleSection title="Past Slots" count={pastSlots.length} defaultOpen={false}>
                    {pastSlots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        selectable={false}
                        selected={false}
                        isPast={true}
                      />
                    ))}
                  </CollapsibleSection>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </MentorLayout>

    {confirmDialog && (
      <ConfirmDialog
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />
    )}
    </>
  )
}
