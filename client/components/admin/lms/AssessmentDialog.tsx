'use client'

import { useEffect, useId, useState } from 'react'
import { Modal, Switch } from '@/components/admin/ui'
import type { Assessment } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { DialogActions, FormField, fieldClass, textareaClass } from './shared'

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
  const formId = useId()
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
    <Modal
      open={open}
      title={initial ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      description={type === 'pre' ? 'Shown before learners enter the course modules.' : 'The final exam after all modules.'}
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="flex flex-col gap-4"
      >
        <FormField label="Title">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={fieldClass}
            required
          />
        </FormField>
        <FormField label="Description (optional)">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
            rows={2}
            className={textareaClass}
          />
        </FormField>
        <div className="grid items-end gap-3 sm:grid-cols-2">
          <ToggleRow label="Graded" checked={form.isGraded} onChange={(v) => setForm((f) => ({ ...f, isGraded: v }))} />
          <FormField label="Passing score (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.passingScore}
              disabled={!form.isGraded}
              onChange={(e) => setForm((f) => ({ ...f, passingScore: Number(e.target.value) }))}
              className={cn(fieldClass, 'disabled:cursor-not-allowed')}
            />
          </FormField>
        </div>
        <ToggleRow
          label="Show correct answers"
          hint="Reveal answers after passing or on the last attempt"
          checked={form.showAnswers}
          onChange={(v) => setForm((f) => ({ ...f, showAnswers: v }))}
        />
        <FormField label="Max attempts" hint="0 means unlimited attempts.">
          <input
            type="number"
            min={0}
            value={form.maxAttempts}
            onChange={(e) => setForm((f) => ({ ...f, maxAttempts: Number(e.target.value) }))}
            className={fieldClass}
          />
        </FormField>
      </form>
    </Modal>
  )
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-[10px] border border-ui-line px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ui-text">{label}</span>
        {hint && <span className="block text-xs text-ui-muted">{hint}</span>}
      </span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}
