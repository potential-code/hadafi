'use client'

import { useEffect, useState } from 'react'
import { SimpleDialog, Field, DialogStyles } from '@/components/admin/widgets/CourseDialog'
import type { Assessment } from '@/lib/api/lms'

type AssessmentFormData = Omit<Assessment, 'id' | 'courseId' | 'assessmentType' | 'questions'>

export function AssessmentDialog({
  open,
  type,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  type: 'pre' | 'post'
  initial?: Assessment
  onClose: () => void
  onSave: (data: AssessmentFormData) => void
}) {
  const [form, setForm] = useState<AssessmentFormData>({
    title: '',
    description: null,
    isGraded: true,
    passingScore: 70,
    showAnswers: false,
    maxAttempts: 0,
  })

  useEffect(() => {
    if (open) {
      setForm({
        title: initial?.title ?? '',
        description: initial?.description ?? null,
        isGraded: initial?.isGraded ?? true,
        passingScore: initial?.passingScore ?? 70,
        showAnswers: initial?.showAnswers ?? false,
        maxAttempts: initial?.maxAttempts ?? 0,
      })
    }
  }, [open, initial])

  const label = type === 'pre' ? 'Pre-test' : 'Post-test'

  return (
    <SimpleDialog open={open} title={initial ? `Edit ${label}` : `Add ${label}`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
        <Field label="Title">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="admin-input"
            required
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))}
            rows={2}
            className="admin-input resize-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-surface-2 px-3 py-2.5 cursor-pointer h-full">
            <span className="text-sm font-semibold text-brand-text-primary">Graded</span>
            <input
              type="checkbox"
              checked={form.isGraded}
              onChange={e => setForm(f => ({ ...f, isGraded: e.target.checked }))}
              className="w-4 h-4 accent-brand-primary"
            />
          </label>
          <Field label="Passing score (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.passingScore}
              disabled={!form.isGraded}
              onChange={e => setForm(f => ({ ...f, passingScore: Number(e.target.value) }))}
              className="admin-input disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-surface-2 px-3 py-2.5 cursor-pointer">
          <div>
            <span className="text-sm font-semibold text-brand-text-primary block">Show correct answers</span>
            <span className="text-[11px] text-brand-text-muted">Reveal answers after passing or last attempt</span>
          </div>
          <input
            type="checkbox"
            checked={form.showAnswers}
            onChange={e => setForm(f => ({ ...f, showAnswers: e.target.checked }))}
            className="w-4 h-4 accent-brand-primary"
          />
        </label>
        <Field label="Max attempts (0 = unlimited)">
          <input
            type="number"
            min={0}
            value={form.maxAttempts}
            onChange={e => setForm(f => ({ ...f, maxAttempts: Number(e.target.value) }))}
            className="admin-input"
          />
        </Field>
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
    </SimpleDialog>
  )
}
