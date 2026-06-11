'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiSaveQuestionAnswer, apiUpdateBlockProgress, type LearnerBlock } from '@/lib/api/lms'
import { cn } from '@/lib/utils'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

export function ActionPlanBlock({ block, onCompleted }: Props) {
  const queryClient = useQueryClient()
  const isAlreadyCompleted = block.blockProgress?.status === 'completed'
  const actionQuestion = block.questions.find((q) => q.kind === 'action-plan')

  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(isAlreadyCompleted)

  useEffect(() => {
    setText('')
    setSubmitted(isAlreadyCompleted)
  }, [block.id, isAlreadyCompleted])

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (actionQuestion) {
        await apiSaveQuestionAnswer(actionQuestion.id, { openEndedAnswer: text.trim() })
      }
      return apiUpdateBlockProgress(block.id, { status: 'completed' })
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      onCompleted()
    },
  })

  return (
    <div>
      {/* Block header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-accent/10 text-brand-accent shrink-0">
          <Send className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-brand-accent uppercase tracking-[0.2em]">Action plan</p>
          <h3 className="text-base sm:text-lg font-black text-brand-text-primary leading-tight">{block.title}</h3>
        </div>
      </div>

      {actionQuestion && (
        <p className="text-sm sm:text-base text-brand-text-primary leading-relaxed font-semibold">
          {actionQuestion.prompt}
        </p>
      )}

      {/* Textarea */}
      <div className="mt-4 relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitted}
          placeholder={actionQuestion?.placeholder ?? 'Write your action plan here…'}
          rows={5}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-sm text-brand-text-primary leading-relaxed placeholder:text-brand-text-muted/70 focus:outline-none transition-all resize-none',
            submitted
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-brand-surface-2 focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/10',
          )}
        />
        {!submitted && (
          <div className="absolute bottom-2 right-3 text-[10px] text-brand-text-muted">
            {text.length} chars
          </div>
        )}
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
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Saved to your action plan
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA */}
      {!submitted && (
        <div className="mt-5 flex items-center justify-end">
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!text.trim() || submitMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-4 py-2 text-xs font-bold shadow-md shadow-brand-primary/30 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed hover:-translate-y-0.5 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            {submitMutation.isPending ? 'Saving…' : 'Save my action plan'}
          </button>
        </div>
      )}
    </div>
  )
}
