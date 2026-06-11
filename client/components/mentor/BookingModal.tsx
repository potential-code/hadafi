'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { getMentorAvailability, bookSession } from '@/lib/api/sme'
import type { Slot, SmeSession } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookingModalProps {
  mentor: {
    name: string
    specialty: string
    avatar: string
    userId: string
    meetingLink?: string | null
  }
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayKey(): string {
  return toDateKey(new Date())
}

function formatSlotTime(iso: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

function formatDateLong(iso: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

// ---------------------------------------------------------------------------
// Mini calendar — adapted from Availability.tsx pattern
// ---------------------------------------------------------------------------

function BookingCalendar({
  year,
  month,
  availableDates,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number
  month: number
  availableDates: Set<string>
  selectedDate: string | null
  onSelectDate: (key: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const today = todayKey()
  const nowDate = new Date()
  const isPrevDisabled = year === nowDate.getFullYear() && month === nowDate.getMonth()

  const firstDay = new Date(year, month, 1)
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

  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push(null)
  }

  return (
    <div className="rounded-2xl bg-brand-surface border border-brand-surface-2 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-surface-2">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={isPrevDisabled}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isPrevDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'}`}
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
          className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-brand-text-secondary" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center px-2 pt-2">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wide py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`empty-${idx}`} />

          const isPast = cell.key < today
          const isToday = cell.key === today
          const isSelected = cell.key === selectedDate
          const hasSlots = availableDates.has(cell.key)
          const isDisabled = isPast || !hasSlots

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelectDate(cell.key)}
              className={cn(
                'relative mx-auto flex flex-col items-center justify-center w-9 h-9 rounded-full text-sm font-medium transition-all',
                isDisabled
                  ? 'opacity-30 cursor-not-allowed text-brand-text-muted'
                  : isSelected
                    ? 'bg-brand-primary text-white shadow-md'
                    : isToday && hasSlots
                      ? 'ring-2 ring-brand-primary text-brand-primary font-bold hover:bg-brand-primary/10'
                      : hasSlots
                        ? 'text-brand-text-primary hover:bg-white cursor-pointer'
                        : 'text-brand-text-muted',
              )}
              aria-label={`${cell.key}${isDisabled ? ' (unavailable)' : ''}`}
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
// Main modal
// ---------------------------------------------------------------------------

export function BookingModal({ mentor, onClose }: BookingModalProps) {
  const [step, setStep] = useState<'calendar' | 'confirm' | 'success'>('calendar')
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({})
  const [loadingAvail, setLoadingAvail] = useState(true)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [booking, setBooking] = useState(false)
  const [confirmedSession, setConfirmedSession] = useState<{
    session: SmeSession
    mentorName: string
  } | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/auth/me')
      .then(({ data }) => setTimezone(data.user.timezone))
      .catch(() => {})
  }, [])

  useEffect(() => {
    getMentorAvailability(mentor.userId)
      .then((data) => {
        setAvailability(data)
        setLoadingAvail(false)
      })
      .catch(() => {
        setLoadingAvail(false)
      })
  }, [mentor.userId])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const availableDates = new Set(Object.keys(availability))
  const hasAnyAvailability = availableDates.size > 0

  const slotsForDate: Slot[] = selectedDate ? (availability[selectedDate] ?? []) : []

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

  function handleSelectDate(key: string) {
    setSelectedDate(key)
    setSelectedSlot(null)
  }

  async function handleConfirm() {
    if (!selectedSlot) return
    setBooking(true)
    try {
      const result = await bookSession(selectedSlot.id)
      setConfirmedSession({ session: result.session, mentorName: result.mentorName })
      setStep('success')
    } catch (err: unknown) {
      const e = err as { success?: boolean; error?: { message?: string; code?: string } }
      if (e?.error?.code === 'SLOT_UNAVAILABLE') {
        toast.error('This slot was just taken. Please pick another time.')
        setSelectedSlot(null)
        setStep('calendar')
      } else {
        toast.error(e?.error?.message ?? 'Failed to book session. Please try again.')
      }
    } finally {
      setBooking(false)
    }
  }

  const tzAbbr = timezone
    ? new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: timezone })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`Book a session with ${mentor.name}`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-brand-surface hover:bg-brand-surface-2 flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-brand-text-secondary" />
        </button>

        <AnimatePresence mode="wait">
          {/* ----------------------------------------------------------------
              Step 1: Calendar
          ---------------------------------------------------------------- */}
          {step === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="p-6"
            >
              {/* Mentor header */}
              <div className="flex items-center gap-3 mb-5 pr-8">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-brand-surface-2 flex-shrink-0">
                  <img
                    src={mentor.avatar}
                    alt={mentor.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-brand-text-primary leading-tight truncate">
                    {mentor.name}
                  </h2>
                  <p className="text-xs text-brand-text-muted line-clamp-1">{mentor.specialty}</p>
                </div>
              </div>

              <p className="text-sm font-semibold text-brand-text-secondary mb-4">
                Select a date and time
              </p>

              {loadingAvail ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
                </div>
              ) : !hasAnyAvailability ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarClock className="w-10 h-10 text-brand-text-muted opacity-40 mb-3" />
                  <p className="text-sm font-semibold text-brand-text-secondary">No availability yet.</p>
                  <p className="text-xs text-brand-text-muted mt-1">
                    Check back soon — {mentor.name} will add slots.
                  </p>
                </div>
              ) : (
                <>
                  <BookingCalendar
                    year={viewYear}
                    month={viewMonth}
                    availableDates={availableDates}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    onPrevMonth={prevMonth}
                    onNextMonth={nextMonth}
                  />

                  {/* Time slots */}
                  {selectedDate && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-text-muted mb-2">
                        Available times
                      </p>
                      {slotsForDate.length === 0 ? (
                        <p className="text-sm text-brand-text-muted text-center py-3">
                          No slots on this date.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slotsForDate.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={cn(
                                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                                selectedSlot?.id === slot.id
                                  ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                                  : 'bg-brand-surface text-brand-text-secondary border-brand-surface-2 hover:border-brand-primary/40 hover:text-brand-primary',
                              )}
                            >
                              {formatSlotTime(slot.startsAt, timezone)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedDate && (
                    <p className="mt-3 text-xs text-brand-text-muted text-center">
                      Highlighted dates have open slots — tap one to begin.
                    </p>
                  )}

                  <p className="mt-3 text-[10px] text-brand-text-muted text-center">
                    {timezone && <>Times shown in your timezone ({timezone} — {tzAbbr})</>}
                  </p>
                </>
              )}

              <button
                type="button"
                disabled={!selectedSlot}
                onClick={() => setStep('confirm')}
                className="mt-5 w-full py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                Continue
              </button>
            </motion.div>
          )}

          {/* ----------------------------------------------------------------
              Step 2: Confirm
          ---------------------------------------------------------------- */}
          {step === 'confirm' && selectedSlot && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="p-6"
            >
              <h2 className="font-bold text-brand-text-primary text-lg mb-1 pr-8">
                Confirm your session
              </h2>
              <p className="text-xs text-brand-text-muted mb-6">
                Review the details below before booking.
              </p>

              <div className="rounded-2xl bg-brand-surface border border-brand-surface-2 p-4 space-y-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-brand-surface-2 flex-shrink-0">
                    <img
                      src={mentor.avatar}
                      alt={mentor.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-text-primary">{mentor.name}</p>
                    <p className="text-xs text-brand-text-muted">{mentor.specialty}</p>
                  </div>
                </div>

                <div className="border-t border-brand-surface-2 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted text-xs font-medium">Date & Time</span>
                    <span className="text-brand-text-primary font-semibold text-xs text-right max-w-[60%]">
                      {formatDateLong(selectedSlot.startsAt, timezone)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted text-xs font-medium">Duration</span>
                    <span className="text-brand-text-primary font-semibold text-xs">1 hour</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted text-xs font-medium">Cost</span>
                    <span className="text-emerald-600 font-bold text-xs">Free for SMEEP members</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('calendar')}
                  className="flex-1 py-2.5 rounded-xl bg-brand-surface text-brand-text-secondary text-sm font-bold hover:bg-brand-surface-2 transition-colors border border-brand-surface-2"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={booking}
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm inline-flex items-center justify-center gap-2"
                >
                  {booking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Booking…
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ----------------------------------------------------------------
              Step 3: Success
          ---------------------------------------------------------------- */}
          {step === 'success' && confirmedSession && selectedSlot && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="p-6 text-center"
            >
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
              </div>

              <h2 className="text-xl font-black text-brand-text-primary mb-1">
                Session confirmed!
              </h2>
              <p className="text-sm text-brand-text-muted mb-4">
                Your session with{' '}
                <span className="font-semibold text-brand-text-primary">{mentor.name}</span>
                {' '}is booked.
              </p>

              <div className="rounded-2xl bg-brand-surface border border-brand-surface-2 p-4 mb-4 text-left space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-brand-text-muted font-medium">Date & Time</span>
                  <span className="text-xs font-semibold text-brand-text-primary text-right max-w-[60%]">
                    {formatDateLong(selectedSlot.startsAt, timezone)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-brand-text-muted font-medium">Duration</span>
                  <span className="text-xs font-semibold text-brand-text-primary">1 hour</span>
                </div>
              </div>

              {confirmedSession.session.meetingLink && (
                <a
                  href={confirmedSession.session.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full mb-3 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Join Session
                </a>
              )}

              <p className="text-xs text-brand-text-muted mb-4">
                A confirmation email has been sent to you.
              </p>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-brand-surface text-brand-text-secondary text-sm font-bold hover:bg-brand-surface-2 transition-colors border border-brand-surface-2"
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
