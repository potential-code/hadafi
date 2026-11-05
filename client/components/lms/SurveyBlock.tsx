'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiSaveQuestionAnswer, apiUpdateBlockProgress, fetchBlockAnswers, type BlockQuestion, type LearnerBlock } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { btn } from '@/components/kit'

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
        <p className="text-[15px] font-semibold text-ui-text leading-relaxed mb-2">{question.prompt}</p>
        <textarea
          aria-label={question.prompt}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={submitted}
          placeholder={question.placeholder || 'Write your answer'}
          rows={4}
          className={cn(
            'w-full rounded-[10px] border bg-ui-surface px-4 py-3 text-sm text-ui-text leading-relaxed placeholder:text-ui-muted focus:outline-none transition-all resize-none',
            submitted
              ? 'border-transparent bg-ui-ok-soft'
              : 'border-ui-line focus:border-ui-brand focus:ring-2 focus:ring-ui-brand/20',
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
      <p className="text-[15px] font-semibold text-ui-text leading-relaxed mb-2">{question.prompt}</p>
      <div className="grid gap-2">
        {options.map((opt, idx) => {
          const isSelected = answer === idx
          return (
            <motion.button
              key={idx}
              type="button"
              aria-pressed={isSelected}
              onClick={() => !submitted && onChange(idx)}
              disabled={submitted}
              whileTap={!submitted ? { scale: 0.99 } : undefined}
              className={cn(
                'relative text-left flex items-center gap-3 rounded-[10px] border px-4 py-3 text-sm transition-all',
                isSelected
                  ? 'border-ui-brand bg-ui-brand-soft text-ui-text shadow-sm'
                  : 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand',
                submitted && !isSelected && 'opacity-50',
              )}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors shrink-0',
                  isSelected ? 'border-ui-brand bg-ui-brand' : 'border-ui-line bg-ui-surface',
                )}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="w-2 h-2 rounded-full bg-ui-surface"
                    />
                  )}
                </AnimatePresence>
              </span>
              <span className="flex-1">{opt}</span>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-ui-brand-text" aria-hidden />}
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

  // A different block starts empty. Only on a block change: the course data
  // refreshes after saving, and clearing then would blank the answers just given.
  useEffect(() => {
    setAnswers({})
  }, [block.id])
  useEffect(() => {
    setSubmitted(isAlreadyCompleted)
  }, [block.id, isAlreadyCompleted])

  // Coming back to a block: show the answers saved before.
  const saved = useQuery({
    queryKey: ['block-answers', block.id],
    queryFn: () => fetchBlockAnswers(block.id),
    enabled: surveyQuestions.length > 0,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (!saved.data) return
    setAnswers((current) => {
      const next = { ...current }
      for (const a of saved.data) {
        if (next[a.questionId] !== undefined) continue
        const d = a.answerData
        if (typeof d?.openEndedAnswer === 'string') next[a.questionId] = d.openEndedAnswer
        else if (typeof d?.selectedAnswer === 'number') next[a.questionId] = d.selectedAnswer
      }
      return next
    })
  }, [saved.data])

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
      queryClient.invalidateQueries({ queryKey: ['block-answers', block.id] })
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
      <p className="text-[15px] text-ui-muted">
        {block.questions.some((q) => q.kind === 'action-plan')
          ? 'Answer these questions about your business.'
          : 'A quick check-in before you move on. There are no wrong answers.'}
      </p>

      {surveyQuestions.length === 0 && (
        <p className="text-sm text-ui-muted italic">No survey questions in this block.</p>
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
            <div role="status" className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-ui-ok-soft px-3 py-2 text-xs font-bold text-ui-ok">
              <CheckCircle2 className="w-4 h-4" />
              Survey complete
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {submitMutation.isError && !submitted && (
        <p role="alert" className="mt-4 text-sm text-ui-danger">
          {submitMutation.error instanceof Error ? submitMutation.error.message : 'Your answers could not be saved.'} Please try again.
        </p>
      )}

      {/* CTA */}
      {!submitted && (
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={!allAnswered || submitMutation.isPending}
            className={btn()}
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
            {submitMutation.isPending ? 'Submitting' : 'Submit answers'}
          </button>
        </div>
      )}
    </div>
  )
}
