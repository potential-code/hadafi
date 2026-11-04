'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import { type LiveEvent } from '@/lib/api/liveEvents'
import { btn, Field, inputClass } from '@/components/kit'
import { IconButton, Segmented, selectClass } from '@/components/admin/ui'
import MediaPicker from '@/components/admin/MediaPicker'
import { type MediaFile } from '@/lib/api/media'
import { revealIfStacked } from '@/components/admin/content/useMediaQuery'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'

// Same-origin: the site forwards /uploads to the API (next.config.ts).
const SERVER_URL = API_BASE

interface Props {
  open: boolean
  initial?: LiveEvent | null
  onClose: () => void
  onSave: (data: Partial<LiveEvent>) => Promise<void>
  className?: string
}

const EMPTY: Partial<LiveEvent> = {
  title: '',
  description: '',
  type: 'Webinar',
  date: '',
  time: '',
  meetingLink: '',
  recordingLink: '',
  coverImage: '',
  status: 'draft',
}

const TYPES = ['Webinar', 'Workshop', 'Panel', 'Masterclass', 'Other']

/**
 * Create / edit panel for a live event (redesign: a side panel next to the
 * events table on wide screens, stacked under it on narrow ones).
 * Same props as the old modal dialog.
 */
export function LiveEventDialog({ open, initial, onClose, onSave, className }: Props) {
  const [form, setForm] = useState<Partial<LiveEvent>>(initial ?? EMPTY)
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
      setForm(initial ?? EMPTY)
      setFieldErrors({})
    }
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
    try {
      await onSave(form)
    } catch (err: unknown) {
      const e = err as { error?: { code?: string; errors?: Record<string, string[]> } }
      if (e?.error?.code === 'VALIDATION_ERROR') {
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

  function set<K extends keyof LiveEvent>(key: K, value: LiveEvent[K]) {
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
                value={form.title ?? ''}
                onChange={(e) => set('title', e.target.value)}
                className={inputClass}
                placeholder="e.g. AI for Women Entrepreneurs: A Practical Masterclass"
                required
              />
            </Field>

            <Field label="Type" htmlFor={id('type')}>
              <select
                id={id('type')}
                value={form.type ?? 'Webinar'}
                onChange={(e) => set('type', e.target.value)}
                className={cn(selectClass, 'h-10 w-full text-sm')}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Date *" htmlFor={id('date')} error={fieldErrors.date}>
                <input
                  id={id('date')}
                  type="date"
                  value={form.date ?? ''}
                  onChange={(e) => { set('date', e.target.value); clearFieldError('date') }}
                  className={cn(inputClass, 'px-2.5')}
                  required
                />
              </Field>
              <Field label="Time *" htmlFor={id('time')} error={fieldErrors.time}>
                <input
                  id={id('time')}
                  value={form.time ?? ''}
                  onChange={(e) => { set('time', e.target.value); clearFieldError('time') }}
                  className={inputClass}
                  placeholder="e.g. 5:00 PM / GST - UAE time"
                  required
                />
              </Field>
            </div>

            <Field label="Description" htmlFor={id('desc')}>
              <textarea
                id={id('desc')}
                value={form.description ?? ''}
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
                value={form.coverImage ?? ''}
                onChange={(e) => { set('coverImage', e.target.value); clearFieldError('coverImage') }}
                className={inputClass}
                placeholder="/images/events/webinar-1.webp or https://"
              />
            </Field>

            <span className="border-t border-ui-line pt-3.5 text-xs font-semibold text-ui-muted">Links</span>
            <Field
              label="Meeting link"
              htmlFor={id('meeting')}
              error={fieldErrors.meetingLink}
              hint="Optional. Add before the event (Zoom, LinkedIn Live, Eventbrite)."
            >
              <input
                id={id('meeting')}
                type="url"
                value={form.meetingLink ?? ''}
                onChange={(e) => { set('meetingLink', e.target.value); clearFieldError('meetingLink') }}
                className={inputClass}
                placeholder="https://zoom.us/j/ or LinkedIn Live URL"
              />
            </Field>
            <Field
              label="Recording link"
              htmlFor={id('recording')}
              error={fieldErrors.recordingLink}
              hint="Add after the event ends (YouTube, Vimeo)."
            >
              <input
                id={id('recording')}
                type="url"
                value={form.recordingLink ?? ''}
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
                value={form.status ?? 'draft'}
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
