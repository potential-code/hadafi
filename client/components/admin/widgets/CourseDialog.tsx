'use client'

import { useEffect, useState } from 'react'
import { type CourseSummary } from '@/lib/api/lms'
import { COURSE_TOPICS, type CourseTopic } from '@/lib/api/redesign'
import { btn } from '@/components/kit'
import { Modal, Switch } from '@/components/admin/ui'

/** Course fields the dialog edits. `category` is the topic (redesign). */
export type CourseFormData = Partial<CourseSummary> & { category?: CourseTopic | null }

export function CourseDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: CourseFormData
  onClose: () => void
  onSave: (data: CourseFormData) => void
}) {
  const [form, setForm] = useState<CourseFormData>(initial ?? {})

  useEffect(() => {
    if (open) setForm(initial ?? {})
  }, [open, initial])

  return (
    <Modal
      open={open}
      title={initial?.id ? 'Edit course' : 'New course'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn({ variant: 'secondary', size: 'sm' })}>
            Cancel
          </button>
          <button type="submit" form="course-dialog-form" className={btn({ size: 'sm' })}>
            Save
          </button>
        </>
      }
    >
      <form
        id="course-dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="space-y-4"
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
            placeholder="https://"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Topic">
            <select
              value={form.category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category: (e.target.value || null) as CourseTopic | null }))}
              className="admin-input"
            >
              <option value="">No topic</option>
              {COURSE_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
        </div>
        <Field label="Points awarded per unit">
          <input
            type="number"
            min={0}
            value={form.pointsPerUnit ?? 10}
            onChange={(e) => setForm((f) => ({ ...f, pointsPerUnit: Number(e.target.value) }))}
            className="admin-input"
          />
          <p className="mt-1 text-xs text-ui-muted">Members earn this many points each time they finish a unit.</p>
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-ui-line px-3 py-2.5">
          <span className="text-sm font-medium text-ui-text">Enable certificate</span>
          <Switch
            label="Enable certificate"
            checked={form.enableCertificate ?? true}
            onChange={(v) => setForm((f) => ({ ...f, enableCertificate: v }))}
          />
        </div>
      </form>
      <DialogStyles />
    </Modal>
  )
}

export function Field({ label, children, asDiv }: { label: string; children: React.ReactNode; asDiv?: boolean }) {
  const labelText = <span className="mb-1.5 block text-[13px] font-semibold text-ui-text">{label}</span>
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

/** Shared input look for admin forms (`className="admin-input"`). */
export function DialogStyles() {
  return (
    <style>{`
      .admin-input {
        width: 100%;
        min-height: 2.5rem;
        background: var(--ui-surface);
        border: 1px solid var(--ui-line);
        border-radius: 10px;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        line-height: 1.4;
        color: var(--ui-text);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .admin-input::placeholder { color: var(--ui-muted); }
      .admin-input:focus {
        outline: none;
        border-color: var(--ui-brand);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-brand) 20%, transparent);
      }
      .admin-input:disabled, .admin-input[readonly] { background: var(--ui-surface-2); color: var(--ui-muted); }
      select.admin-input { appearance: auto; }
    `}</style>
  )
}

export function SimpleDialog({
  open,
  title,
  onClose,
  children,
  size,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} size={size}>
      {children}
      <DialogStyles />
    </Modal>
  )
}
