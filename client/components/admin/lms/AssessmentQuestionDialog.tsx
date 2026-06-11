'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SimpleDialog, Field, DialogStyles } from '@/components/admin/widgets/CourseDialog'
import { cn } from '@/lib/utils'
import type { AssessmentQuestion } from '@/lib/api/lms'

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
    if (t === 'true-false') {
      setForm(f => ({ ...f, questionType: 'true-false', options: ['True', 'False'], correctAnswer: 0 }))
    } else {
      setForm(f => ({ ...f, questionType: 'multiple-choice', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0 }))
    }
  }

  return (
    <SimpleDialog open={open} title={initial ? 'Edit question' : 'New question'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
        <Field label="Question type">
          <div className="grid grid-cols-2 gap-2">
            {(['multiple-choice', 'true-false'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all',
                  form.questionType === t
                    ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                    : 'border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/40',
                )}
              >
                {t === 'multiple-choice' ? 'Multiple choice' : 'True / False'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Question text">
          <textarea
            value={form.questionText}
            onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
            rows={2}
            className="admin-input resize-none"
            required
          />
        </Field>

        {form.questionType === 'multiple-choice' && (
          <Field label="Options (select correct answer)">
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correctAnswer === i}
                    onChange={() => setForm(f => ({ ...f, correctAnswer: i }))}
                    className="w-4 h-4 accent-brand-primary flex-shrink-0"
                  />
                  <input
                    value={opt}
                    onChange={e => {
                      const next = [...form.options]
                      next[i] = e.target.value
                      setForm(f => ({ ...f, options: next }))
                    }}
                    className="admin-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setForm(f => {
                        const next = f.options.filter((_, idx) => idx !== i)
                        return { ...f, options: next, correctAnswer: Math.min(f.correctAnswer, next.length - 1) }
                      })
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, options: [...f.options, `Option ${String.fromCharCode(65 + f.options.length)}`] }))}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:gap-2 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add option
              </button>
            </div>
          </Field>
        )}

        {form.questionType === 'true-false' && (
          <Field label="Correct answer">
            <div className="flex gap-2">
              {[0, 1].map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, correctAnswer: i }))}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-xl border-2 text-sm font-bold transition-colors',
                    form.correctAnswer === i
                      ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                      : 'border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/40',
                  )}
                >
                  {i === 0 ? 'True' : 'False'}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Explanation (optional)">
          <textarea
            value={form.explanation ?? ''}
            onChange={e => setForm(f => ({ ...f, explanation: e.target.value || null }))}
            rows={2}
            className="admin-input resize-none"
            placeholder="Shown to learner after answering (if Show Answers is on)"
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
