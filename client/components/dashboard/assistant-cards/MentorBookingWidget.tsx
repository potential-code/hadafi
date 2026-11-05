'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  CalendarClock,
  ExternalLink,
  Ban,
} from 'lucide-react'
import { getMentors, getMentorAvailability, bookSession } from '@/lib/api/sme'
import type { MentorUser, Slot, SmeSession } from '@/lib/api/sme'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

function initialsAvatar(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=9f2063&fontSize=42&radius=50`
}

// ── Calendar helpers (same logic as BookingModal) ──────────────────────────

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

// ── Mini calendar sub-component ────────────────────────────────────────────

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
    <div className="rounded-xl bg-ui-surface-2 border border-ui-line overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ui-line">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={isPrevDisabled}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isPrevDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-ui-surface'}`}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-ui-muted" />
        </button>
        <span className="text-xs font-semibold text-ui-text">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="w-6 h-6 rounded hover:bg-ui-surface flex items-center justify-center transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-3.5 h-3.5 text-ui-muted" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center px-1 pt-1.5">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-ui-muted uppercase py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 px-1 pb-2">
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
                'relative mx-auto flex flex-col items-center justify-center w-7 h-7 rounded-full text-[13px] font-medium transition-all',
                isDisabled
                  ? 'opacity-30 cursor-not-allowed text-ui-muted'
                  : isSelected
                    ? 'bg-ui-brand text-white shadow-sm'
                    : isToday && hasSlots
                      ? 'ring-2 ring-ui-brand text-ui-brand-text font-semibold hover:bg-ui-brand-soft'
                      : hasSlots
                        ? 'text-ui-text hover:bg-ui-surface cursor-pointer'
                        : 'text-ui-muted',
              )}
              aria-label={`${cell.key}${isDisabled ? ' (unavailable)' : ''}`}
            >
              {cell.day}
              {hasSlots && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-ui-brand" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main widget ────────────────────────────────────────────────────────────

type Step = 'loading' | 'mentor_selection' | 'slot_selection' | 'confirming' | 'booking' | 'success' | 'no_availability' | 'not_found'

interface MentorBookingWidgetProps {
  mentorName?: string
  respond?: (result: unknown) => void
  onRegisterCancel?: (fn: () => void) => void
  onDone?: () => void
}

export function MentorBookingWidget({ mentorName, respond, onRegisterCancel, onDone }: MentorBookingWidgetProps) {
  // All hooks declared unconditionally first — Rules of Hooks requires this.
  const [cancelled, setCancelled] = useState(false)
  const [step, setStep] = useState<Step>('loading')
  const [mentor, setMentor] = useState<MentorUser | null>(null)
  const [allMentors, setAllMentors] = useState<MentorUser[]>([])
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({})
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [confirmedSession, setConfirmedSession] = useState<{ session: SmeSession; mentorName: string } | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const respondedRef = useRef(false)
  const initRef = useRef<string | null>(null)
  const didRegisterCancelRef = useRef(false)

  function safeRespond(result: unknown) {
    if (respondedRef.current) return
    respondedRef.current = true
    respond?.(result)
    onDone?.()
  }

  // Auto-respond for terminal dead-end states so the bot replies without
  // requiring the user to click a close button.
  useEffect(() => {
    if (step === 'not_found') {
      const t = setTimeout(() => safeRespond({ error: 'not_found', mentorName }), 800)
      return () => clearTimeout(t)
    }
    if (step === 'no_availability' && mentor) {
      const t = setTimeout(() => safeRespond({ noAvailability: true, mentorName: mentor.fullName }), 800)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mentor?.fullName])

  // Register the cancel function exactly once per mount. A separate [] effect
  // prevents streaming mentorName updates from re-registering and self-cancelling
  // via the parent's cancelActiveBookingRef. didRegisterCancelRef guards against
  // StrictMode's double-invocation.
  useEffect(() => {
    if (didRegisterCancelRef.current) return
    didRegisterCancelRef.current = true
    onRegisterCancel?.(() => {
      setCancelled(true)
      safeRespond({ cancelled: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mentorName || initRef.current === mentorName) return
    initRef.current = mentorName

    // Reset stale state from a previous mentor before fetching new data.
    respondedRef.current = false
    setCancelled(false)
    setStep('loading')
    setMentor(null)
    setAvailability({})
    setSelectedDate(null)
    setSelectedSlot(null)
    setConfirmedSession(null)
    setBookingError(null)

    async function init() {
      const [, mentors] = await Promise.all([
        apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/account/me')
          .then(({ data }) => setTimezone(data.user.timezone))
          .catch(() => {}),
        getMentors().catch(() => [] as MentorUser[]),
      ])

      const list = mentors as MentorUser[]

      if (!mentorName) {
        setAllMentors(list)
        setStep('mentor_selection')
        return
      }

      const lc = mentorName.toLowerCase()
      const found =
        list.find((m) => m.fullName.toLowerCase() === lc) ??
        list.find((m) => m.fullName.toLowerCase().includes(lc))

      if (!found) {
        setStep('not_found')
        return
      }

      setMentor(found)

      const avail = await getMentorAvailability(found.id).catch(() => ({} as Record<string, Slot[]>))
      setAvailability(avail)

      if (Object.keys(avail).length === 0) {
        setStep('no_availability')
        return
      }

      // Open the calendar on the first month that actually has slots, so the
      // learner never lands on a month of greyed-out dates.
      const firstDate = Object.keys(avail).sort()[0]
      if (firstDate) {
        const d = new Date(`${firstDate}T00:00:00`)
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
      }

      setStep('slot_selection')
    }

    void init()
    // onRegisterCancel and state setters are stable for this widget's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorName])

  // Safety: if no name provided, auto-respond immediately.
  useEffect(() => {
    if (!mentorName) safeRespond({ error: 'no_mentor_name' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!mentorName) return null

  if (cancelled) {
    return (
      <div className="rounded-xl border border-ui-line bg-ui-surface-2 px-4 py-3 my-2 max-w-sm">
        <div className="flex items-center gap-2">
          <Ban className="w-3.5 h-3.5 text-ui-muted flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-ui-muted">Booking not completed</p>
            <p className="text-[12px] text-ui-muted mt-0.5">This booking was cancelled — a new request was started.</p>
          </div>
        </div>
      </div>
    )
  }

  async function handleSelectMentor(selected: MentorUser) {
    setMentor(selected)
    setStep('loading')
    const avail = await getMentorAvailability(selected.id).catch(() => ({} as Record<string, Slot[]>))
    setAvailability(avail)
    if (Object.keys(avail).length === 0) {
      setStep('no_availability')
      // auto-respond fires via the useEffect watching step + mentor
      return
    }
    const firstDate = Object.keys(avail).sort()[0]
    if (firstDate) {
      const d = new Date(`${firstDate}T00:00:00`)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    setStep('slot_selection')
  }

  async function handleConfirm() {
    if (!selectedSlot) return
    setStep('booking')
    setBookingError(null)
    try {
      const result = await bookSession(selectedSlot.id)
      setConfirmedSession({ session: result.session, mentorName: result.mentorName })
      setStep('success')
      setTimeout(() => safeRespond({
        success: true,
        mentorName: result.mentorName,
        sessionDate: selectedSlot.startsAt,
        meetingLink: result.session.meetingLink,
      }), 1500)
    } catch (err: unknown) {
      const e = err as { error?: { code?: string; message?: string } }
      if (e?.error?.code === 'SLOT_UNAVAILABLE') {
        setBookingError('This slot was just taken. Please pick a different time.')
        setSelectedSlot(null)
        setStep('slot_selection')
      } else {
        setBookingError(e?.error?.message ?? 'Failed to book session. Please try again.')
        setStep('confirming')
      }
    }
  }

  function prevMonth() {
    const now = new Date()
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const availableDates = new Set(Object.keys(availability))
  const slotsForDate: Slot[] = selectedDate ? (availability[selectedDate] ?? []) : []
  const tzAbbr = timezone
    ? new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: timezone })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    : ''
  const avatarSrc = mentor ? (mentor.avatarUrl ?? initialsAvatar(mentor.fullName)) : ''

  return (
    <div className="rounded-xl border border-ui-line bg-ui-surface p-4 shadow-sm my-2 max-w-sm">
      <AnimatePresence mode="wait">

        {step === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 text-ui-brand-text animate-spin flex-shrink-0" />
            <p className="text-xs text-ui-muted">Checking availability…</p>
          </motion.div>
        )}

        {step === 'mentor_selection' && (
          <motion.div key="mentor_selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm font-semibold text-ui-text mb-3">Choose a mentor to book</p>
            {allMentors.length === 0 ? (
              <p className="text-xs text-ui-muted text-center py-4">No mentors available right now.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pe-0.5">
                {allMentors.map((m) => {
                  const avatarSrc = m.avatarUrl ?? initialsAvatar(m.fullName)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void handleSelectMentor(m)}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-ui-line hover:border-ui-brand/40 hover:bg-ui-surface-2 text-left transition-all"
                    >
                      <img
                        src={optimizedSrc(avatarSrc)}
                        alt={m.fullName}
                        className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ui-text leading-tight truncate">{m.fullName}</p>
                        {m.expertise?.[0] && (
                          <p className="text-[12px] text-ui-brand-text truncate">{m.expertise[0]}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}

        {step === 'not_found' && (
          <motion.div key="not_found" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-center py-4">
            <p className="text-sm font-semibold text-ui-muted">Mentor not found</p>
            <p className="text-xs text-ui-muted mt-1">
              I couldn't find a mentor named "{mentorName}".
            </p>
          </motion.div>
        )}

        {step === 'no_availability' && mentor && (
          <motion.div key="no_avail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-center py-4">
            <CalendarClock className="w-8 h-8 text-ui-muted opacity-40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-ui-muted">No availability yet</p>
            <p className="text-xs text-ui-muted mt-1">
              {mentor.fullName} has no open slots right now.
            </p>
          </motion.div>
        )}

        {step === 'slot_selection' && mentor && (
          <motion.div key="slot_selection" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-ui-line flex-shrink-0">
                <img src={optimizedSrc(avatarSrc)} alt={mentor.fullName} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ui-text leading-tight">{mentor.fullName}</p>
                {mentor.expertise?.[0] && (
                  <p className="text-[12px] text-ui-brand-text">{mentor.expertise[0]}</p>
                )}
              </div>
            </div>

            <p className="text-[13px] font-semibold text-ui-muted mb-2">Select a date</p>

            {bookingError && (
              <p className="text-[12px] text-ui-danger mb-2">{bookingError}</p>
            )}

            <BookingCalendar
              year={viewYear}
              month={viewMonth}
              availableDates={availableDates}
              selectedDate={selectedDate}
              onSelectDate={(key) => { setSelectedDate(key); setSelectedSlot(null) }}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
            />

            {selectedDate && (
              <div className="mt-3">
                <p className="text-[12px] font-semibold text-ui-muted mb-1.5">
                  Available times
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {slotsForDate.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[13px] font-semibold transition-all border',
                        selectedSlot?.id === slot.id
                          ? 'bg-ui-brand text-white border-ui-brand shadow-sm'
                          : 'bg-ui-surface-2 text-ui-muted border-ui-line hover:border-ui-brand/40 hover:text-ui-text',
                      )}
                    >
                      {formatSlotTime(slot.startsAt, timezone)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!selectedDate && (
              <p className="mt-2 text-[12px] text-ui-muted text-center">
                Dates with open slots are highlighted — tap one to see times.
              </p>
            )}

            {timezone && (
              <p className="mt-2 text-[11px] text-ui-muted text-center">
                Times shown in your timezone ({tzAbbr})
              </p>
            )}

            <button
              type="button"
              disabled={!selectedSlot}
              onClick={() => setStep('confirming')}
              className="mt-3 w-full py-2 rounded-[10px] bg-ui-brand text-white text-xs font-semibold hover:bg-ui-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </motion.div>
        )}

        {(step === 'confirming' || step === 'booking') && mentor && selectedSlot && (
          <motion.div key="confirming" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="text-sm font-semibold text-ui-text mb-0.5">Confirm your session</p>
            <p className="text-[12px] text-ui-muted mb-3">Review the details below before booking.</p>

            <div className="rounded-xl bg-ui-surface-2 border border-ui-line p-3 space-y-2.5 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-ui-line flex-shrink-0">
                  <img src={optimizedSrc(avatarSrc)} alt={mentor.fullName} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ui-text">{mentor.fullName}</p>
                  {mentor.expertise?.[0] && (
                    <p className="text-[12px] text-ui-muted">{mentor.expertise[0]}</p>
                  )}
                </div>
              </div>
              <div className="border-t border-ui-line pt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[12px] text-ui-muted font-medium">Date & Time</span>
                  <span className="text-[12px] text-ui-text font-semibold text-right max-w-[55%]">
                    {formatDateLong(selectedSlot.startsAt, timezone)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[12px] text-ui-muted font-medium">Duration</span>
                  <span className="text-[12px] text-ui-text font-semibold">1 hour</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[12px] text-ui-muted font-medium">Cost</span>
                  <span className="text-[12px] text-ui-ok font-semibold">Free for Hadafi members</span>
                </div>
              </div>
            </div>

            {bookingError && (
              <p className="text-[12px] text-ui-danger mb-2">{bookingError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={step === 'booking'}
                onClick={() => setStep('slot_selection')}
                className="flex-1 py-2 rounded-lg bg-ui-surface-2 text-ui-muted text-xs font-semibold hover:bg-ui-surface-2 transition-colors border border-ui-line disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                disabled={step === 'booking'}
                onClick={handleConfirm}
                className="flex-1 py-2 rounded-[10px] bg-ui-brand text-white text-xs font-semibold hover:bg-ui-brand-hover disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {step === 'booking' ? (
                  <><Loader2 className="w-3 h-3 animate-spin" />Booking…</>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </div>
          </motion.div>
        )}

        {step === 'success' && confirmedSession && selectedSlot && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center py-2">
            <div className="w-12 h-12 rounded-full bg-ui-ok-soft flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-ui-ok" />
            </div>
            <p className="text-sm font-black text-ui-text mb-0.5">Session confirmed!</p>
            <p className="text-xs text-ui-muted mb-3">
              Your session with{' '}
              <span className="font-semibold text-ui-text">{confirmedSession.mentorName}</span>
              {' '}is booked.
            </p>
            <div className="rounded-xl bg-ui-surface-2 border border-ui-line p-3 mb-3 text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-[12px] text-ui-muted font-medium">Date & Time</span>
                <span className="text-[12px] font-semibold text-ui-text text-right max-w-[55%]">
                  {formatDateLong(selectedSlot.startsAt, timezone)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[12px] text-ui-muted font-medium">Duration</span>
                <span className="text-[12px] font-semibold text-ui-text">1 hour</span>
              </div>
            </div>
            {confirmedSession.session.meetingLink && (
              <a
                href={confirmedSession.session.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="w-full mb-2 inline-flex items-center justify-center gap-1.5 py-2 rounded-[10px] bg-ui-brand text-white text-xs font-semibold hover:bg-ui-brand-hover transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Join Session
              </a>
            )}
            <p className="text-[12px] text-ui-muted">
              Confirmation email sent to you and {confirmedSession.mentorName}.
            </p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
