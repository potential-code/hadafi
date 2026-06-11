'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ListChecks, Send } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiSaveQuestionAnswer, apiUpdateBlockProgress, type BlockQuestion, type LearnerBlock } from '@/lib/api/lms'
import { cn } from '@/lib/utils'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

type Answers = Record<string, number | string>

function QuestionItem({
  question,
  answer,
  submitted,
  onChange,
}: {
  question: BlockQuestion
  answer: number | string | undefined
  submitted: boolean
  onChange: (value: number | string) => void
}) {
  if (question.format === 'short-text') {
    return (
      <div className="mt-4">
        <p className="text-sm font-semibold text-brand-text-primary leading-relaxed mb-2">{question.prompt}</p>
        <textarea
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={submitted}
          placeholder={question.placeholder ?? 'Write your answer…'}
          rows={4}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-sm text-brand-text-primary leading-relaxed placeholder:text-brand-text-muted/70 focus:outline-none transition-all resize-none',
            submitted
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-brand-surface-2 focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/10',
          )}
        />
      </div>
    )
  }

  const options =
    question.format === 'true-false'
      ? ['True', 'False']
      : (question.options ?? [])

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-brand-text-primary leading-relaxed mb-2">{question.prompt}</p>
      <div className="grid gap-2">
        {options.map((opt, idx) => {
          const isSelected = answer === idx
          return (
            <motion.button
              key={idx}
              type="button"
              onClick={() => !submitted && onChange(idx)}
              disabled={submitted}
              whileHover={!submitted ? { x: 3 } : undefined}
              whileTap={!submitted ? { scale: 0.99 } : undefined}
              className={cn(
                'relative text-left flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all',
                isSelected
                  ? 'border-brand-primary bg-brand-primary/5 text-brand-text-primary shadow-sm'
                  : 'border-brand-surface-2 bg-white text-brand-text-primary hover:border-brand-primary/40',
                submitted && !isSelected && 'opacity-50',
              )}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors shrink-0',
                  isSelected ? 'border-brand-primary bg-brand-primary' : 'border-brand-surface-2 bg-white',
                )}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="w-2 h-2 rounded-full bg-white"
                    />
                  )}
                </AnimatePresence>
              </span>
              <span className="flex-1">{opt}</span>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-primary" />}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export function SurveyBlock({ block, onCompleted }: Props) {
  const queryClient = useQueryClient()
  const isAlreadyCompleted = block.blockProgress?.status === 'completed'
  const surveyQuestions = block.questions

  const [answers, setAnswers] = useState<Answers>({})
  const [submitted, setSubmitted] = useState(isAlreadyCompleted)

  useEffect(() => {
    setAnswers({})
    setSubmitted(isAlreadyCompleted)
  }, [block.id, isAlreadyCompleted])

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Save each question answer
      await Promise.all(
        surveyQuestions.map((q) => {
          const ans = answers[q.id]
          if (q.format === 'short-text') {
            return apiSaveQuestionAnswer(q.id, { openEndedAnswer: String(ans ?? '') })
          }
          return apiSaveQuestionAnswer(q.id, { selectedAnswer: typeof ans === 'number' ? ans : 0 })
        }),
      )
      // Mark block complete
      return apiUpdateBlockProgress(block.id, { status: 'completed' })
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      onCompleted()
    },
  })

  const allAnswered = surveyQuestions.every((q) => {
    const ans = answers[q.id]
    if (q.format === 'short-text') return typeof ans === 'string' && ans.trim().length > 0
    return typeof ans === 'number'
  })

  return (
    <div>
      {/* Block header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-violet/10 text-brand-violet shrink-0">
          <ListChecks className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-brand-violet uppercase tracking-[0.2em]">
            {block.questions.some(q => q.kind === 'action-plan') ? 'Questions' : 'Survey questions'}
          </p>
          <h3 className="text-base sm:text-lg font-black text-brand-text-primary leading-tight">{block.title}</h3>
        </div>
      </div>

      {surveyQuestions.length === 0 && (
        <p className="text-sm text-brand-text-muted italic">No survey questions in this block.</p>
      )}

      {/* Questions */}
      {surveyQuestions.map((q) => (
        <QuestionItem
          key={q.id}
          question={q}
          answer={answers[q.id]}
          submitted={submitted}
          onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
        />
      ))}

      {/* Submitted banner */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Survey complete
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA */}
      {!submitted && (
        <div className="mt-5 flex items-center justify-end">
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!allAnswered || submitMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-4 py-2 text-xs font-bold shadow-md shadow-brand-primary/30 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed hover:-translate-y-0.5 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            {submitMutation.isPending ? 'Submitting…' : 'Submit answers'}
          </button>
        </div>
      )}
    </div>
  )
}
