'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, Info, Link2, Loader2, MapPin, Video, X } from 'lucide-react'
import { fetchZoomInfo, type AdminLiveEvent, type EventFormat, type EventInput } from '@/lib/api/liveEvents'
import { btn, Field, inputClass } from '@/components/kit'
import { IconButton, Segmented, selectClass } from '@/components/admin/ui'
import MediaPicker from '@/components/admin/MediaPicker'
import { type MediaFile } from '@/lib/api/media'
import { revealIfStacked } from '@/components/admin/content/useMediaQuery'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'

const SERVER_URL = API_BASE

interface Props {
  open: boolean
  initial?: AdminLiveEvent | null
  onClose: () => void
  onSave: (data: EventInput) => Promise<void>
  className?: string
}

/** The form: the start is entered as a day and time in the chosen time zone. */
type Form = {
  title: string
  description: string
  type: string
  day: string
  start: string
  timezone: string
  durationMinutes: number
  /** Empty for no limit. */
  capacity: string
  format: EventFormat
  meetingLink: string
  location: string
  recordingLink: string
  coverImage: string
  status: 'draft' | 'published'
}

const EMPTY: Form = {
  title: '',
  description: '',
  type: 'Webinar',
  day: '',
  start: '17:00',
  timezone: 'Asia/Dubai',
  durationMinutes: 60,
  capacity: '',
  format: 'zoom',
  meetingLink: '',
  location: '',
  recordingLink: '',
  coverImage: '',
  status: 'draft',
}

const DURATIONS = [30, 45, 60, 90, 120, 180]

/** Zones offered first; the event's own zone is always in the list. */
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Dubai', label: 'UAE time (Dubai, GMT+4)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia time (Riyadh, GMT+3)' },
  { value: 'Asia/Qatar', label: 'Qatar time (Doha, GMT+3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain time (GMT+3)' },
  { value: 'Asia/Kuwait', label: 'Kuwait time (GMT+3)' },
  { value: 'Asia/Muscat', label: 'Oman time (Muscat, GMT+4)' },
  { value: 'Africa/Cairo', label: 'Egypt time (Cairo)' },
  { value: 'Asia/Amman', label: 'Jordan time (Amman)' },
  { value: 'Asia/Beirut', label: 'Lebanon time (Beirut)' },
  { value: 'Africa/Casablanca', label: 'Morocco time (Casablanca)' },
  { value: 'Europe/London', label: 'UK time (London)' },
  { value: 'UTC', label: 'UTC' },
]

function formFrom(e: AdminLiveEvent | null | undefined, zoomReady: boolean): Form {
  if (!e) return { ...EMPTY, format: zoomReady ? 'zoom' : 'link' }
  return {
    title: e.title,
    description: e.description ?? '',
    type: e.type,
    // The day and time as entered, in the event's own zone (from the server).
    day: e.startDate,
    start: e.startTime,
    timezone: e.timezone,
    durationMinutes: e.durationMinutes,
    capacity: e.capacity == null ? '' : String(e.capacity),
    format: e.format,
    meetingLink: e.meetingLink ?? '',
    location: e.location ?? '',
    recordingLink: e.recordingLink ?? '',
    coverImage: e.coverImage ?? '',
    status: e.status,
  }
}

const TYPES = ['Webinar', 'Workshop', 'Panel', 'Masterclass', 'Other']

/**
 * Create / edit panel for a live event (redesign: a side panel next to the
 * events table on wide screens, stacked under it on narrow ones).
 * Same props as the old modal dialog.
 */
export function LiveEventDialog({ open, initial, onClose, onSave, className }: Props) {
  const { data: zoomInfo } = useQuery({ queryKey: ['admin', 'zoom-info'], queryFn: fetchZoomInfo, staleTime: 5 * 60_000 })
  const zoomReady = zoomInfo?.configured ?? true
  const [form, setForm] = useState<Form>(() => formFrom(initial, zoomReady))
  const [saving, setSaving] = useState(false)
  const [mediaPicker, setMediaPicker] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [imgBroken, setImgBroken] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const id = (k: string) => `${uid}-${k}`

  useEffect(() => {
    if (open) {
      setForm(formFrom(initial, zoomReady))
      setFieldErrors({})
    }
    // zoomReady only picks the default for a new event; don't reset an open form when it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  // Focus the title and bring the panel into view when it opens or switches event.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      titleRef.current?.focus({ preventScroll: true })
      revealIfStacked(panelRef.current)
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, initial?.id])

  useEffect(() => setImgBroken(false), [form.coverImage])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFieldErrors({})
    if (!form.day || !form.start) {
      setFieldErrors({ startsAt: 'Pick a day and a start time' })
      setSaving(false)
      return
    }
    const capacity = form.capacity.trim() === '' ? null : Number(form.capacity)
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      setFieldErrors({ capacity: 'Use a whole number of places, or leave it empty for no limit' })
      setSaving(false)
      return
    }
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        startDate: form.day,
        startTime: form.start,
        timezone: form.timezone,
        durationMinutes: form.durationMinutes,
        capacity,
        format: form.format,
        meetingLink: form.format === 'link' ? form.meetingLink.trim() || null : null,
        location: form.format === 'in_person' ? form.location.trim() || null : null,
        recordingLink: form.recordingLink.trim() || null,
        coverImage: form.coverImage.trim() || null,
        status: form.status,
      })
    } catch (err: unknown) {
      const e = err as { error?: { code?: string; message?: string; errors?: Record<string, string[]> } }
      if (e?.error?.code === 'LOCATION_REQUIRED') setFieldErrors({ location: e.error.message ?? 'Add where it takes place' })
      else if (e?.error?.code === 'ZOOM_NOT_CONFIGURED') setFieldErrors({ format: e.error.message ?? 'Zoom isn’t connected' })
      else if (e?.error?.code === 'CAPACITY_BELOW_BOOKINGS') setFieldErrors({ capacity: errorMessage(err, 'More learners have already booked') })
      else if (e?.error?.code && ['START_REQUIRED', 'INVALID_START', 'INVALID_TIMEZONE'].includes(e.error.code)) {
        setFieldErrors({ startsAt: errorMessage(err, 'Check the day and time') })
      }
      else if (e?.error?.code === 'VALIDATION_ERROR') {
        const mapped: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(e.error.errors ?? {})) {
          if (Array.isArray(msgs) && msgs[0]) mapped[key] = msgs[0]
        }
        setFieldErrors(mapped)
      }
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleMediaSelect(file: MediaFile) {
    set('coverImage', `${SERVER_URL}/${file.path}`)
    setMediaPicker(false)
  }

  const isEdit = !!initial?.id
  const headingId = id('heading')

  return (
    <>
      <aside
        ref={panelRef}
        aria-labelledby={headingId}
        className={cn('flex scroll-mt-20 flex-col rounded-[14px] border border-ui-line bg-ui-surface', className)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !mediaPicker) onClose()
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-ui-line px-[18px] py-3.5">
          <h2 id={headingId} className="flex-1 text-base font-semibold text-ui-text">
            {isEdit ? 'Edit event' : 'New event'}
          </h2>
          <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex flex-col gap-3.5 px-[18px] py-4">
            <span className="text-xs font-semibold text-ui-muted">Event details</span>

            <Field label="Title *" htmlFor={id('title')}>
              <input
                id={id('title')}
                ref={titleRef}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className={inputClass}
                placeholder="e.g. AI for Women Entrepreneurs: A Practical Masterclass"
                required
              />
            </Field>

            <Field label="Type" htmlFor={id('type')}>
              <select
                id={id('type')}
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className={cn(selectClass, 'h-10 w-full text-sm')}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2.5">
              <Field label="Date *" htmlFor={id('date')} error={fieldErrors.startsAt}>
                <input
                  id={id('date')}
                  type="date"
                  value={form.day}
                  onChange={(e) => { set('day', e.target.value); clearFieldError('startsAt') }}
                  className={cn(inputClass, 'px-2.5')}
                  required
                />
              </Field>
              <Field label="Starts *" htmlFor={id('time')}>
                <input
                  id={id('time')}
                  type="time"
                  step={300}
                  value={form.start}
                  onChange={(e) => { set('start', e.target.value); clearFieldError('startsAt') }}
                  className={cn(inputClass, 'px-2.5')}
                  required
                />
              </Field>
            </div>
            <Field label="Time zone" htmlFor={id('tz')} hint="Learners see the time in their own zone.">
              <select
                id={id('tz')}
                value={form.timezone}
                onChange={(e) => { set('timezone', e.target.value); clearFieldError('startsAt') }}
                className={cn(selectClass, 'h-10 w-full text-sm')}
              >
                {(TIMEZONES.some((t) => t.value === form.timezone) ? TIMEZONES : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES]).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            {initial?.timeNeedsReview && (
              <p role="status" className="flex items-start gap-2 rounded-[10px] bg-ui-danger-soft px-3 py-2 text-[13px] text-ui-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  The old time{initial.legacyTime ? ` (“${initial.legacyTime}”)` : ''} couldn’t be read, so this event was kept at noon on its date. Set
                  the real start time and save.
                </span>
              </p>
            )}
            <Field label="Length" htmlFor={id('duration')}>
              <select
                id={id('duration')}
                value={form.durationMinutes}
                onChange={(e) => set('durationMinutes', Number(e.target.value))}
                className={cn(selectClass, 'h-10 w-full text-sm')}
              >
                {[...new Set([...DURATIONS, form.durationMinutes])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`.replace('.5 hours', '½ hours')}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Places"
              htmlFor={id('capacity')}
              error={fieldErrors.capacity}
              hint="Leave empty for no limit. Booking closes when it’s full."
            >
              <input
                id={id('capacity')}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.capacity}
                onChange={(e) => { set('capacity', e.target.value); clearFieldError('capacity') }}
                className={inputClass}
                placeholder="No limit"
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ui-text">Where</span>
              <Segmented<EventFormat>
                label="Where the event happens"
                className="self-start"
                value={form.format}
                onChange={(v) => { set('format', v); clearFieldError('format'); clearFieldError('location') }}
                options={[
                  { value: 'zoom', label: 'Zoom meeting', icon: Video },
                  { value: 'link', label: 'Other link', icon: Link2 },
                  { value: 'in_person', label: 'In person', icon: MapPin },
                ]}
              />
              {fieldErrors.format && <p className="text-[13px] text-ui-danger" role="alert">{fieldErrors.format}</p>}
              {form.format === 'zoom' && (
                <p className={cn('flex items-start gap-2 rounded-[10px] px-3 py-2 text-[13px]', zoomReady ? 'bg-ui-surface-2 text-ui-muted' : 'bg-ui-danger-soft text-ui-danger')}>
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {!zoomReady
                    ? 'Zoom isn’t connected on this server yet. Add the Zoom credentials, or choose another link.'
                    : zoomInfo?.mock
                      ? 'Test mode: Zoom isn’t connected here, so meetings and links are placeholders.'
                      : 'Hadafi creates the Zoom meeting. Everyone who books gets their own join link, and attendance is read back afterwards.'}
                </p>
              )}
              {form.format === 'link' && (
                <Field label="Meeting link" htmlFor={id('meeting')} error={fieldErrors.meetingLink} hint="Teams, Google Meet, LinkedIn Live. Only learners who booked see it, from an hour before." className="mt-1">
                  <input
                    id={id('meeting')}
                    type="url"
                    value={form.meetingLink}
                    onChange={(e) => { set('meetingLink', e.target.value); clearFieldError('meetingLink') }}
                    className={inputClass}
                    placeholder="https://"
                  />
                </Field>
              )}
              {form.format === 'in_person' && (
                <Field label="Venue *" htmlFor={id('location')} error={fieldErrors.location} className="mt-1">
                  <input
                    id={id('location')}
                    value={form.location}
                    maxLength={300}
                    onChange={(e) => { set('location', e.target.value); clearFieldError('location') }}
                    className={inputClass}
                    placeholder="e.g. Hub71, Al Khatem Tower, Abu Dhabi"
                  />
                </Field>
              )}
            </div>

            <Field label="Description" htmlFor={id('desc')}>
              <textarea
                id={id('desc')}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
                className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal')}
                placeholder="Brief description of this event"
              />
            </Field>

            <span className="border-t border-ui-line pt-3.5 text-xs font-semibold text-ui-muted">Cover image (optional)</span>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ui-surface-2 text-ui-muted">
                {form.coverImage && !imgBroken ? (
                  <img src={form.coverImage} alt="Cover preview" className="h-full w-full object-cover" onError={() => setImgBroken(true)} />
                ) : (
                  <CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1 text-xs text-ui-muted">Pick from the media library or paste a URL directly.</span>
              <button type="button" onClick={() => setMediaPicker(true)} className={btn({ variant: 'secondary', size: 'sm' })}>
                Choose from library
              </button>
            </div>
            <Field label="Image URL" htmlFor={id('img')} error={fieldErrors.coverImage}>
              <input
                id={id('img')}
                value={form.coverImage}
                onChange={(e) => { set('coverImage', e.target.value); clearFieldError('coverImage') }}
                className={inputClass}
                placeholder="/images/events/webinar-1.webp or https://"
              />
            </Field>

            <span className="border-t border-ui-line pt-3.5 text-xs font-semibold text-ui-muted">After the event</span>
            <Field
              label="Recording link"
              htmlFor={id('recording')}
              error={fieldErrors.recordingLink}
              hint="Add after the event ends (YouTube, Vimeo)."
            >
              <input
                id={id('recording')}
                type="url"
                value={form.recordingLink}
                onChange={(e) => { set('recordingLink', e.target.value); clearFieldError('recordingLink') }}
                className={inputClass}
                placeholder="https://youtube.com/watch?v= or Vimeo URL"
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ui-text">Status</span>
              <Segmented
                label="Status"
                className="self-start"
                value={form.status}
                onChange={(v) => set('status', v)}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                ]}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-ui-line px-[18px] py-3">
            <button type="button" onClick={onClose} className={btn({ variant: 'secondary' })}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btn()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isEdit ? 'Save changes' : 'Create event'}
            </button>
          </div>
        </form>
      </aside>

      <MediaPicker open={mediaPicker} onClose={() => setMediaPicker(false)} onSelect={handleMediaSelect} accept="image" />
    </>
  )
}
