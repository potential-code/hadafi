'use client'

import { useEffect, useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { IconButton, Modal, Segmented } from '@/components/admin/ui'
import { btn } from '@/components/kit'
import type { AssessmentQuestion } from '@/lib/api/lms'
import { DialogActions, FormField, fieldClass, textareaClass } from './shared'

type QuestionFormData = Omit<AssessmentQuestion, 'id' | 'assessmentId' | 'order'>

export function AssessmentQuestionDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: AssessmentQuestion
  onClose: () => void
  onSave: (data: QuestionFormData) => void
}) {
  const formId = useId()
  const radioName = useId()
  const [form, setForm] = useState<QuestionFormData>({
    questionType: 'multiple-choice',
    questionText: '',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswer: 0,
    explanation: null,
  })

  useEffect(() => {
    if (open) {
      setForm({
        questionType: initial?.questionType ?? 'multiple-choice',
        questionText: initial?.questionText ?? '',
        options: initial?.options ?? ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: initial?.correctAnswer ?? 0,
        explanation: initial?.explanation ?? null,
      })
    }
  }, [open, initial])

  function setType(t: 'multiple-choice' | 'true-false') {
    if (t === form.questionType) return
    if (t === 'true-false') {
      setForm((f) => ({ ...f, questionType: 'true-false', options: ['True', 'False'], correctAnswer: 0 }))
    } else {
      setForm((f) => ({ ...f, questionType: 'multiple-choice', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0 }))
    }
  }

  return (
    <Modal
      open={open}
      title={initial ? 'Edit question' : 'New question'}
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSave(form)
        }}
        className="flex flex-col gap-4"
      >
        <FormField label="Question type" asDiv>
          <Segmented
            label="Question type"
            value={form.questionType}
            onChange={setType}
            options={[
              { value: 'multiple-choice', label: 'Multiple choice' },
              { value: 'true-false', label: 'True or false' },
            ]}
            className="self-start"
          />
        </FormField>

        <FormField label="Question text">
          <textarea
            value={form.questionText}
            onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
            rows={2}
            className={textareaClass}
            required
          />
        </FormField>

        {form.questionType === 'multiple-choice' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ui-text">Options (select the correct answer)</legend>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioName}
                  checked={form.correctAnswer === i}
                  onChange={() => setForm((f) => ({ ...f, correctAnswer: i }))}
                  aria-label={`Mark option ${i + 1} as correct`}
                  className="h-4 w-4 shrink-0 accent-[var(--ui-brand)]"
                />
                <input
                  value={opt}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) => {
                    const next = [...form.options]
                    next[i] = e.target.value
                    setForm((f) => ({ ...f, options: next }))
                  }}
                  className={fieldClass}
                />
                <IconButton
                  label={`Remove option ${i + 1}`}
                  icon={Trash2}
                  tone="danger"
                  onClick={() =>
                    setForm((f) => {
                      const next = f.options.filter((_, idx) => idx !== i)
                      return { ...f, options: next, correctAnswer: Math.min(f.correctAnswer, next.length - 1) }
                    })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, options: [...f.options, `Option ${String.fromCharCode(65 + f.options.length)}`] }))
              }
              className={btn({ variant: 'ghost', size: 'sm', className: 'self-start text-ui-brand-text' })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add option
            </button>
          </fieldset>
        )}

        {form.questionType === 'true-false' && (
          <FormField label="Correct answer" asDiv>
            <Segmented
              label="Correct answer"
              value={form.correctAnswer === 0 ? 'true' : 'false'}
              onChange={(v) => setForm((f) => ({ ...f, correctAnswer: v === 'true' ? 0 : 1 }))}
              options={[
                { value: 'true', label: 'True' },
                { value: 'false', label: 'False' },
              ]}
              className="self-start"
            />
          </FormField>
        )}

        <FormField label="Explanation (optional)" hint="Shown to the learner after answering, if correct answers are shown.">
          <textarea
            value={form.explanation ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value || null }))}
            rows={2}
            className={textareaClass}
          />
        </FormField>
      </form>
    </Modal>
  )
}
