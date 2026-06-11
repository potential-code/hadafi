'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { type CourseSummary } from '@/lib/api/lms'

export function CourseDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: Partial<CourseSummary>
  onClose: () => void
  onSave: (data: Partial<CourseSummary>) => void
}) {
  const [form, setForm] = useState<Partial<CourseSummary>>(initial ?? {})

  useEffect(() => {
    if (open) setForm(initial ?? {})
  }, [open, initial])

  if (!open) return null

  return (
    <AnimatePresence>
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
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-brand-surface-2 overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-brand-surface-2">
            <h3 className="text-lg font-black text-brand-text-primary">
              {initial?.id ? 'Edit course' : 'New course'}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSave(form)
            }}
            className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
          >
            <Field label="Title">
              <input
                value={form.title ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="admin-input"
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="admin-input resize-none"
              />
            </Field>
            <Field label="Cover image URL">
              <input
                value={form.cover ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cover: e.target.value }))}
                className="admin-input"
                placeholder="https://…"
              />
            </Field>
            <Field label="Difficulty">
              <select
                value={form.difficulty ?? 'Beginner'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, difficulty: e.target.value as 'Beginner' | 'Intermediate' | 'Advanced' }))
                }
                className="admin-input"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </Field>
            <Field label="Points awarded per unit">
              <input
                type="number"
                min={0}
                value={form.pointsPerUnit ?? 10}
                onChange={(e) => setForm((f) => ({ ...f, pointsPerUnit: Number(e.target.value) }))}
                className="admin-input"
              />
              <p className="mt-1 text-[11px] text-brand-text-muted">
                Members earn this many points each time they finish a unit.
              </p>
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-surface-2 px-3 py-2.5 cursor-pointer">
              <span className="text-sm font-semibold text-brand-text-primary">Enable certificate</span>
              <input
                type="checkbox"
                checked={form.enableCertificate ?? true}
                onChange={(e) => setForm((f) => ({ ...f, enableCertificate: e.target.checked }))}
                className="w-4 h-4 accent-brand-primary"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg"
              >
                Save
              </button>
            </div>
          </form>
          <DialogStyles />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function Field({ label, children, asDiv }: { label: string; children: React.ReactNode; asDiv?: boolean }) {
  const labelText = (
    <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-1.5">
      {label}
    </span>
  )
  if (asDiv) {
    return (
      <div>
        {labelText}
        {children}
      </div>
    )
  }
  return (
    <label className="block">
      {labelText}
      {children}
    </label>
  )
}

export function DialogStyles() {
  return (
    <style>{`
      .admin-input {
        width: 100%;
        background: var(--color-brand-surface);
        border: 1px solid var(--color-brand-surface-2);
        border-radius: 0.75rem;
        padding: 0.625rem 0.875rem;
        font-size: 0.875rem;
        color: var(--color-brand-text-primary);
        transition: all 0.15s ease;
      }
      .admin-input:focus {
        outline: none;
        background: white;
        border-color: var(--color-brand-primary);
        box-shadow: 0 0 0 3px rgba(159, 32, 99, 0.15);
      }
    `}</style>
  )
}

export function SimpleDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
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
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-brand-surface-2 overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-brand-surface-2">
            <h3 className="text-lg font-black text-brand-text-primary">{title}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
          <DialogStyles />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
