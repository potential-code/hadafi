'use client'

/**
 * Shared building blocks for the mentor portal pages (dashboard, sessions,
 * availability, calendar, mentees, profile). Visual primitives come from the
 * redesign kit; this file only adds mentor-specific pieces and helpers.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { getCountryData, getCountryDataList, getEmojiFlag, type TCountryCode } from 'countries-list'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button, inputClass } from '@/components/kit'
import { cn } from '@/lib/utils'
import type { SessionWithDetails } from '@/lib/api/mentorSessions'

// ── Profile (/api/account/me) ────────────────────────────────────────────────────

export interface MeUser {
  id: string
  fullName: string
  email: string
  role: string
  country: string | null
  bio: string | null
  company: string | null
  phone: string | null
  avatarUrl: string | null
  linkedinUrl: string | null
  timezone: string | null
  meetingLink: string | null
  createdAt: string
  hasPassword: boolean
}

export interface ApiError {
  error?: { message?: string; code?: string; errors?: Record<string, string[]> } | string
}

export function apiErrorMessage(err: unknown, fallback: string) {
  const e = (err as ApiError | undefined)?.error
  if (typeof e === 'string') return e || fallback
  return e?.message ?? fallback
}

export function fetchMe() {
  return apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/account/me').then((r) => r.data.user)
}

export function updateMe(body: Partial<Record<keyof MeUser, string | null>>) {
  return apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/account/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then((r) => r.data.user)
}

export function isHttpsUrl(v: string) {
  if (!v) return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

/** A country for display: some accounts store the two-letter code ("AE"), most store the name. */
export function countryName(value: string | null | undefined): string {
  if (!value) return ''
  if (/^[A-Z]{2}$/.test(value)) {
    try {
      return getCountryData(value as TCountryCode)?.name ?? value
    } catch {
      return value
    }
  }
  return value
}

// ── Time helpers ──────────────────────────────────────────────────────────────

export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Short zone name, e.g. "GST" or "UTC". */
export function tzAbbr(tz?: string | null, at = new Date()) {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', ...(tz ? { timeZone: tz } : {}) })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    )
  } catch {
    return ''
  }
}

function fmt(iso: string | Date, opts: Intl.DateTimeFormatOptions, tz?: string | null) {
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso))
  }
}

/** "10:00" (24 hour). */
export const fmtTime = (iso: string | Date, tz?: string | null) =>
  fmt(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz)
/** "Thu, Oct 1" */
export const fmtDay = (iso: string | Date, tz?: string | null) => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' }, tz)
/** "Wed, Sep 30, 2026" */
export const fmtDayYear = (iso: string | Date, tz?: string | null) =>
  fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, tz)
/** "Oct 1, 2026" */
export const fmtDate = (iso: string | Date, tz?: string | null) => fmt(iso, { month: 'short', day: 'numeric', year: 'numeric' }, tz)
/** "Oct 1" */
export const fmtShort = (iso: string | Date, tz?: string | null) => fmt(iso, { month: 'short', day: 'numeric' }, tz)

/** YYYY-MM-DD for the instant in the given zone (browser zone when omitted). */
export function dayKey(d: string | Date, tz?: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(d))
  } catch {
    const x = new Date(d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
}

export function minutesBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export function durationLabel(mins: number) {
  if (mins <= 0) return ''
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m) return `${h}h ${m}m`
  return h === 1 ? '1 hour' : `${h} hours`
}

/** "Starts in 30 min", "Starts in 3 hours", "Starts tomorrow", "Happening now". */
export function startsInLabel(startsAt: string, endsAt: string, now = new Date(), tz?: string | null) {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  const t = now.getTime()
  if (t >= start && t < end) return 'Happening now'
  const mins = Math.round((start - t) / 60000)
  if (mins < 60) return `Starts in ${Math.max(mins, 1)} min`
  if (mins < 60 * 12 || dayKey(startsAt, tz) === dayKey(now, tz)) {
    const h = Math.round(mins / 60)
    return `Starts in ${h} hour${h === 1 ? '' : 's'}`
  }
  const tomorrow = new Date(t + 86400000)
  if (dayKey(startsAt, tz) === dayKey(tomorrow, tz)) return 'Starts tomorrow'
  const days = Math.round(mins / 1440)
  return `Starts in ${days} day${days === 1 ? '' : 's'}`
}

// ── Session classification ───────────────────────────────────────────────────

export type Phase = 'upcoming' | 'live' | 'needs' | 'completed' | 'cancelled'

export function sessionPhase(s: SessionWithDetails, now = new Date()): Phase {
  if (s.status === 'completed') return 'completed'
  if (s.status === 'cancelled') return 'cancelled'
  const start = new Date(s.slot.startsAt).getTime()
  const end = new Date(s.slot.endsAt).getTime()
  if (s.needsCompletion || end <= now.getTime()) return 'needs'
  if (start <= now.getTime()) return 'live'
  return 'upcoming'
}

/** Split the API buckets into what the redesigned pages show. */
export function classifySessions(data: { upcoming: SessionWithDetails[]; past: SessionWithDetails[] }, now = new Date()) {
  const all = [...data.upcoming, ...data.past]
  const seen = new Set<string>()
  const unique = all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
  const byStart = (a: SessionWithDetails, b: SessionWithDetails) =>
    new Date(a.slot.startsAt).getTime() - new Date(b.slot.startsAt).getTime()
  const upcoming = unique.filter((s) => ['upcoming', 'live'].includes(sessionPhase(s, now))).sort(byStart)
  const needs = unique.filter((s) => sessionPhase(s, now) === 'needs').sort((a, b) => byStart(b, a))
  const completed = unique.filter((s) => s.status === 'completed').sort((a, b) => byStart(b, a))
  const cancelled = unique.filter((s) => s.status === 'cancelled').sort((a, b) => byStart(b, a))
  return { all: unique, upcoming, needs, completed, cancelled }
}

// ── UI pieces ─────────────────────────────────────────────────────────────────

/** Day/month box shown beside a session ("THU / 1 / OCT"). */
export function DateBox({ iso, tz, className }: { iso: string; tz?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-xl border border-ui-line bg-ui-surface',
        className,
      )}
    >
      <small className="text-[11px] font-semibold uppercase text-ui-muted">{fmt(iso, { weekday: 'short' }, tz)}</small>
      <strong className="text-xl font-bold leading-[1.1] text-ui-text">{fmt(iso, { day: 'numeric' }, tz)}</strong>
      <small className="text-[11px] font-semibold uppercase text-ui-muted">{fmt(iso, { month: 'short' }, tz)}</small>
    </span>
  )
}

/** Rounded icon tile used in card headers and alerts. */
export function IconTile({ children, tone = 'brand', size = 40 }: { children: ReactNode; tone?: 'brand' | 'muted' | 'surface'; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[10px]',
        tone === 'brand' && 'bg-ui-brand-soft text-ui-brand-text',
        tone === 'muted' && 'bg-ui-surface-2 text-ui-muted',
        tone === 'surface' && 'bg-ui-surface text-ui-brand-text',
      )}
    >
      {children}
    </span>
  )
}

/** Accessible confirm dialog in the redesign style. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  variant = 'default',
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mk-confirm-title"
        aria-describedby="mk-confirm-msg"
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
              variant === 'danger' ? 'bg-ui-danger-soft text-ui-danger' : 'bg-ui-brand-soft text-ui-brand-text',
            )}
          >
            {variant === 'danger' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <h2 id="mk-confirm-title" className="text-[15px] font-semibold text-ui-text">{title}</h2>
            <p id="mk-confirm-msg" className="mt-1 text-sm leading-relaxed text-ui-muted">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button ref={confirmRef} variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export type ConfirmState = {
  title: string
  message: string
  confirmLabel: string
  variant: 'danger' | 'default'
  onConfirm: () => void
} | null

// ── Phone input (code select + number) ───────────────────────────────────────

const PHONE_COUNTRIES = getCountryDataList()
  .filter((c) => c.phone.length > 0)
  .map((c) => ({ iso2: c.iso2, name: c.name, dialCode: `+${c.phone[0]}`, emoji: getEmojiFlag(c.iso2) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const DIAL_TO_ISO2 = new Map<string, string>()
for (const c of PHONE_COUNTRIES) if (!DIAL_TO_ISO2.has(c.dialCode)) DIAL_TO_ISO2.set(c.dialCode, c.iso2)

function parsePhone(value: string) {
  if (!value) return { iso2: '', dialCode: '', number: '' }
  const sp = value.indexOf(' ')
  if (sp > 0) {
    const code = value.slice(0, sp)
    if (/^\+\d{1,4}$/.test(code) && DIAL_TO_ISO2.has(code)) return { iso2: DIAL_TO_ISO2.get(code)!, dialCode: code, number: value.slice(sp + 1) }
  }
  if (/^\+\d{1,4}$/.test(value) && DIAL_TO_ISO2.has(value)) return { iso2: DIAL_TO_ISO2.get(value)!, dialCode: value, number: '' }
  return { iso2: '', dialCode: '', number: value }
}

/** Same stored format as the shared PhoneField ("+971 501234567"), restyled. */
export function PhoneInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { iso2, dialCode, number } = useMemo(() => parsePhone(value), [value])
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2">
      <div className="relative">
        <label htmlFor={`${id}-cc`} className="sr-only">Country code</label>
        <select
          id={`${id}-cc`}
          value={iso2}
          onChange={(e) => {
            const c = PHONE_COUNTRIES.find((x) => x.iso2 === e.target.value)
            if (!c) return onChange(number)
            onChange(number ? `${c.dialCode} ${number}` : c.dialCode)
          }}
          className={cn(inputClass, 'cursor-pointer appearance-none pr-8')}
        >
          <option value="">Code</option>
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso2} value={c.iso2}>{c.emoji} {c.dialCode}</option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={number}
        placeholder="Number"
        onChange={(e) => {
          const clean = e.target.value.replace(/[^\d\s\-()+]/g, '')
          if (!clean) return onChange(dialCode)
          onChange(dialCode ? `${dialCode} ${clean}` : clean)
        }}
        className={inputClass}
      />
    </div>
  )
}
