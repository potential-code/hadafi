'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, ImageIcon } from 'lucide-react'
import { type LiveEvent } from '@/lib/api/liveEvents'
import { Field, DialogStyles } from '@/components/admin/widgets/CourseDialog'
import MediaPicker from '@/components/admin/MediaPicker'
import { type MediaFile } from '@/lib/api/media'

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

interface Props {
  open: boolean
  initial?: LiveEvent | null
  onClose: () => void
  onSave: (data: Partial<LiveEvent>) => Promise<void>
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

export function LiveEventDialog({ open, initial, onClose, onSave }: Props) {
  const [form, setForm] = useState<Partial<LiveEvent>>(initial ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [mediaPicker, setMediaPicker] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) { setForm(initial ?? EMPTY); setFieldErrors({}) }
  }, [open, initial])

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

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-brand-surface-2 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-brand-surface-2 flex-shrink-0">
                <h3 className="text-lg font-black text-brand-text-primary">
                  {initial?.id ? 'Edit event' : 'New event'}
                </h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              {/* Form body */}
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                  {/* ── Section 1: Event details ── */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                      Event details
                    </p>

                    <Field label="Title *">
                      <input
                        value={form.title ?? ''}
                        onChange={(e) => set('title', e.target.value)}
                        className="admin-input"
                        placeholder="e.g. AI for SMEs: A Practical Masterclass"
                        required
                      />
                    </Field>

                    <Field label="Type">
                      <select
                        value={form.type ?? 'Webinar'}
                        onChange={(e) => set('type', e.target.value)}
                        className="admin-input"
                      >
                        <option>Webinar</option>
                        <option>Workshop</option>
                        <option>Panel</option>
                        <option>Masterclass</option>
                        <option>Other</option>
                      </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date *">
                        <input
                          type="date"
                          value={form.date ?? ''}
                          onChange={(e) => set('date', e.target.value)}
                          className="admin-input"
                          required
                        />
                      </Field>
                      <Field label="Time *">
                        <input
                          value={form.time ?? ''}
                          onChange={(e) => set('time', e.target.value)}
                          className="admin-input"
                          placeholder="e.g. 5:00 PM / GST - UAE time"
                          required
                        />
                      </Field>
                    </div>

                    <Field label="Description">
                      <textarea
                        value={form.description ?? ''}
                        onChange={(e) => set('description', e.target.value)}
                        rows={4}
                        className="admin-input resize-none"
                        placeholder="Brief description of this event…"
                      />
                    </Field>
                  </div>

                  {/* ── Section 2: Cover image ── */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                      Cover image (optional)
                    </p>

                    <Field label="Image URL">
                      <div className="flex items-center gap-2">
                        <input
                          value={form.coverImage ?? ''}
                          onChange={(e) => set('coverImage', e.target.value)}
                          className="admin-input flex-1"
                          placeholder="/images/events/webinar-1.jpg or https://…"
                        />
                        {form.coverImage && (
                          <div className="flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden border border-brand-surface-2 bg-brand-surface">
                            <img
                              src={form.coverImage}
                              alt="Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMediaPicker(true)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-surface-2 bg-white text-brand-text-muted text-xs font-semibold hover:border-brand-primary/40 hover:text-brand-primary transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Choose from library
                      </button>
                    </Field>
                    <p className="text-[11px] text-brand-text-muted -mt-2">
                      Pick from the media library or paste a URL directly.
                    </p>
                  </div>

                  {/* ── Section 3: Links ── */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                      Links
                    </p>

                    <div className="rounded-xl border border-brand-surface-2 overflow-hidden">
                      {/* Meeting link */}
                      <div className="px-4 pt-4 pb-3">
                        <label className="block">
                          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-1.5">
                            Meeting / Registration link
                          </span>
                          <input
                            type="url"
                            value={form.meetingLink ?? ''}
                            onChange={(e) => { set('meetingLink', e.target.value); clearFieldError('meetingLink') }}
                            className="admin-input"
                            placeholder="https://zoom.us/j/… or LinkedIn Live URL"
                          />
                        </label>
                        {fieldErrors.meetingLink ? (
                          <p className="mt-1 text-xs text-red-500">{fieldErrors.meetingLink}</p>
                        ) : (
                          <p className="mt-1.5 text-[11px] text-brand-text-muted">
                            Optional. Add before the event (Zoom, LinkedIn Live, Eventbrite…)
                          </p>
                        )}
                      </div>

                      {/* Before / After divider */}
                      <div className="relative flex items-center px-4 py-2">
                        <div className="flex-1 h-px bg-brand-surface-2" />
                        <span className="mx-3 px-2.5 py-0.5 rounded-full border border-brand-surface-2 bg-white text-[10px] font-semibold text-brand-text-muted whitespace-nowrap">
                          Before ↕ After
                        </span>
                        <div className="flex-1 h-px bg-brand-surface-2" />
                      </div>

                      {/* Recording link */}
                      <div className="px-4 pb-4 pt-3">
                        <label className="block">
                          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-1.5">
                            Recording link
                          </span>
                          <input
                            type="url"
                            value={form.recordingLink ?? ''}
                            onChange={(e) => { set('recordingLink', e.target.value); clearFieldError('recordingLink') }}
                            className="admin-input"
                            placeholder="https://youtube.com/watch?v=… or Vimeo URL"
                          />
                        </label>
                        {fieldErrors.recordingLink ? (
                          <p className="mt-1 text-xs text-red-500">{fieldErrors.recordingLink}</p>
                        ) : (
                          <p className="mt-1.5 text-[11px] text-brand-text-muted">
                            Add after the event ends (YouTube, Vimeo…)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 border-t border-brand-surface-2 px-6 py-4 flex items-center justify-between gap-4">
                  {/* Status toggle */}
                  <div className="inline-flex rounded-xl border border-brand-surface-2 bg-brand-surface p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => set('status', 'draft')}
                      className={
                        form.status === 'draft'
                          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white transition-colors'
                          : 'px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text-muted hover:text-brand-text-primary transition-colors'
                      }
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => set('status', 'published')}
                      className={
                        form.status === 'published'
                          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-primary text-white transition-colors'
                          : 'px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text-muted hover:text-brand-text-primary transition-colors'
                      }
                    >
                      Published
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              </form>

              <DialogStyles />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MediaPicker
        open={mediaPicker}
        onClose={() => setMediaPicker(false)}
        onSelect={handleMediaSelect}
        accept="image"
      />
    </>
  )
}
