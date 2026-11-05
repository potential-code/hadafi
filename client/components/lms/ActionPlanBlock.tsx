'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiSaveQuestionAnswer, apiUpdateBlockProgress, fetchBlockAnswers, type LearnerBlock } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { btn } from '@/components/kit'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

/**
 * An action-plan block: one written answer per prompt. A block can hold
 * several prompts, and the server only marks it done once every one has an
 * answer, so each gets its own box and all are saved together.
 */
export function ActionPlanBlock({ block, onCompleted }: Props) {
  const queryClient = useQueryClient()
  const isAlreadyCompleted = block.blockProgress?.status === 'completed'
  const prompts = block.questions.filter((q) => q.kind === 'action-plan')

  const [texts, setTexts] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(isAlreadyCompleted)

  // A different block starts empty. Only on a block change: the course data
  // refreshes after saving, and clearing then would blank the answers just saved.
  useEffect(() => {
    setTexts({})
  }, [block.id])
  useEffect(() => {
    setSubmitted(isAlreadyCompleted)
  }, [block.id, isAlreadyCompleted])

  // Answers saved before (a finished block, or one left half done) fill their boxes.
  const saved = useQuery({
    queryKey: ['block-answers', block.id],
    queryFn: () => fetchBlockAnswers(block.id),
    enabled: prompts.length > 0,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (!saved.data) return
    setTexts((current) => {
      const next = { ...current }
      for (const a of saved.data) {
        const answer = a.answerData?.openEndedAnswer
        if (typeof answer === 'string' && !next[a.questionId]) next[a.questionId] = answer
      }
      return next
    })
  }, [saved.data])

  const allAnswered = prompts.length > 0 && prompts.every((p) => (texts[p.id] ?? '').trim().length > 0)

  const submitMutation = useMutation({
    mutationFn: async () => {
      for (const p of prompts) {
        await apiSaveQuestionAnswer(p.id, { openEndedAnswer: (texts[p.id] ?? '').trim() })
      }
      return apiUpdateBlockProgress(block.id, { status: 'completed' })
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      queryClient.invalidateQueries({ queryKey: ['block-answers', block.id] })
      onCompleted()
    },
  })

  return (
    <div>
      <p className="mb-2 text-[15px] text-ui-muted">Turn this unit into a step for your own business. Your answers build your action plan.</p>

      <div className="flex flex-col gap-6">
        {prompts.map((p, i) => {
          const value = texts[p.id] ?? ''
          const fieldId = `action-plan-${p.id}`
          return (
            <div key={p.id}>
              <label htmlFor={fieldId} className="block text-base sm:text-[17px] text-ui-text leading-relaxed font-semibold">
                {prompts.length > 1 && <span className="mr-1.5 text-ui-muted">{i + 1}.</span>}
                {p.prompt.trim()}
              </label>
              <div className="mt-3 relative">
                <textarea
                  id={fieldId}
                  value={value}
                  onChange={(e) => setTexts((t) => ({ ...t, [p.id]: e.target.value }))}
                  disabled={submitted}
                  placeholder={p.placeholder || 'Write your action plan here'}
                  rows={prompts.length > 1 ? 3 : 5}
                  className={cn(
                    'w-full rounded-[10px] border bg-ui-surface px-4 py-3 text-sm text-ui-text leading-relaxed placeholder:text-ui-muted focus:outline-none transition-all resize-none',
                    submitted
                      ? 'border-transparent bg-ui-ok-soft'
                      : 'border-ui-line focus:border-ui-brand focus:ring-2 focus:ring-ui-brand/20',
                  )}
                />
                {!submitted && (
                  <div aria-hidden className="absolute bottom-2 right-3 text-xs text-ui-muted">
                    {value.length} chars
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Saved badge */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div role="status" className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-ui-ok-soft px-3 py-2 text-xs font-bold text-ui-ok">
              <CheckCircle2 className="w-4 h-4" aria-hidden />
              Saved to your action plan
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
        <div className="mt-5 flex items-center justify-end gap-3">
          {prompts.length > 1 && !allAnswered && (
            <span className="text-xs text-ui-muted">Answer all {prompts.length} questions to save</span>
          )}
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={!allAnswered || submitMutation.isPending}
            className={btn()}
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
            {submitMutation.isPending ? 'Saving' : 'Save my action plan'}
          </button>
        </div>
      )}
    </div>
  )
}
