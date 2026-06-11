'use client'

import { useState } from 'react'
import { CheckCircle2, Lock, RotateCcw, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  fetchAssessmentSummary,
  fetchAssessmentQuestions,
  apiSubmitAssessmentAttempt,
  type AssessmentSummary,
} from '@/lib/api/lms'
import { cn } from '@/lib/utils'

type Props = {
  assessmentId: string
  isLocked: boolean
  onCompleted?: () => void
}

type ViewState = 'summary' | 'taking' | 'result'

// ─── Summary view ─────────────────────────────────────────────────────────────

function SummaryView({
  summary,
  isLocked,
  onStart,
}: {
  summary: AssessmentSummary
  isLocked: boolean
  onStart: () => void
}) {
  const { assessment, attemptsMade, attemptsRemaining, hasPassed, bestScore, latestAttempt, canStartAssessment } =
    summary
  const isPre = assessment.assessmentType === 'pre'

  return (
    <div>
      {/* Badge + title */}
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em]',
            isPre
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'bg-brand-violet/10 text-brand-violet',
          )}
        >
          {isPre ? 'Pre-Test' : 'Post-Test'}
        </span>
        {hasPassed && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em]">
            <CheckCircle2 className="w-3 h-3" />
            Passed
          </span>
        )}
      </div>

      <h3 className="text-lg font-black text-brand-text-primary leading-tight">{assessment.title}</h3>
      {assessment.description && (
        <p className="mt-1.5 text-sm text-brand-text-muted leading-relaxed">{assessment.description}</p>
      )}

      {/* Stats grid (graded only) */}
      {assessment.isGraded && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Attempts made" value={String(attemptsMade)} />
          <StatBox
            label="Attempts remaining"
            value={attemptsRemaining === -1 ? 'Unlimited' : String(attemptsRemaining)}
          />
          <StatBox
            label="Best score"
            value={bestScore !== null ? `${bestScore}%` : '—'}
          />
          <StatBox label="Passing score" value={`${assessment.passingScore}%`} />
        </div>
      )}

      {/* Latest attempt */}
      {latestAttempt && (
        <div
          className={cn(
            'mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
            latestAttempt.passed
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700',
          )}
        >
          {latestAttempt.passed ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="font-semibold">
            {latestAttempt.passed ? 'Passed' : 'Did not pass'} — Attempt {latestAttempt.attemptNumber}
            {latestAttempt.score !== null && ` · ${latestAttempt.score}%`}
          </span>
        </div>
      )}

      {/* Locked state */}
      {isLocked && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-brand-surface-2 bg-brand-surface px-4 py-3 text-sm text-brand-text-muted">
          <Lock className="w-4 h-4 shrink-0" />
          Complete previous sections first to unlock this assessment.
        </div>
      )}

      {/* No attempts remaining */}
      {!isLocked && !canStartAssessment && !hasPassed && attemptsMade > 0 && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          You have used all available attempts and did not reach the passing score.
        </div>
      )}

      {/* Start / Retake button */}
      {!isLocked && canStartAssessment && (
        <div className="mt-5">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 transition-all"
          >
            {attemptsMade > 0 ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                Retake assessment
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Start assessment
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-brand-surface-2 bg-brand-surface px-3 py-2.5 text-center">
      <p className="text-base font-black text-brand-text-primary">{value}</p>
      <p className="text-[10px] text-brand-text-muted mt-0.5 leading-snug">{label}</p>
    </div>
  )
}

// ─── Taking view ───────────────────────────────────────────────────────────────

function TakingView({
  assessmentId,
  onSubmit,
  onBack,
}: {
  assessmentId: string
  onSubmit: (answers: Record<string, number>) => void
  onBack: () => void
}) {
  const { data: questions, isLoading } = useQuery({
    queryKey: ['assessment-questions', assessmentId],
    queryFn: () => fetchAssessmentQuestions(assessmentId),
  })

  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})

  if (isLoading || !questions) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-brand-surface-2 rounded w-24" />
        <div className="h-6 bg-brand-surface-2 rounded w-3/4" />
        <div className="h-12 bg-brand-surface-2 rounded" />
        <div className="h-12 bg-brand-surface-2 rounded" />
      </div>
    )
  }

  const total = questions.length
  const q = questions[currentIdx]
  const isLast = currentIdx === total - 1
  const allAnswered = questions.every((qu) => answers[qu.id] !== undefined)

  const options =
    q.questionType === 'true-false' ? ['True', 'False'] : q.options

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center justify-between text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-4">
        <span>Question {currentIdx + 1} of {total}</span>
        <span>{Object.keys(answers).length}/{total} answered</span>
      </div>
      <div className="h-1.5 rounded-full bg-brand-surface-2 overflow-hidden mb-6">
        <motion.div
          animate={{ width: `${((currentIdx + 1) / total) * 100}%` }}
          transition={{ duration: 0.3 }}
          className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
        />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25 }}
        >
          <p className="text-base sm:text-lg font-semibold text-brand-text-primary leading-relaxed mb-4">
            {q.questionText}
          </p>

          <div className="grid gap-2">
            {options.map((opt, idx) => {
              const isSelected = answers[q.id] === idx
              return (
                <motion.button
                  key={idx}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    'relative text-left flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all',
                    isSelected
                      ? 'border-brand-primary bg-brand-primary/5 text-brand-text-primary shadow-sm'
                      : 'border-brand-surface-2 bg-white text-brand-text-primary hover:border-brand-primary/40',
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
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={() => currentIdx > 0 ? setCurrentIdx((i) => i - 1) : onBack()}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-brand-surface-2 px-4 py-2.5 text-xs font-bold text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary transition-all"
        >
          {currentIdx === 0 ? 'Cancel' : 'Previous'}
        </button>

        {!isLast ? (
          <button
            onClick={() => setCurrentIdx((i) => i + 1)}
            disabled={answers[q.id] === undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => onSubmit(answers)}
            disabled={!allAnswered}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Submit
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Result view ───────────────────────────────────────────────────────────────

function ResultView({
  summary,
  onRetake,
  onBack,
}: {
  summary: AssessmentSummary
  onRetake: () => void
  onBack: () => void
}) {
  const { assessment, hasPassed, bestScore, latestAttempt, attemptsRemaining, correctAnswers } = summary

  const score = latestAttempt?.score ?? bestScore ?? 0
  const correct = assessment.isGraded
    ? Math.round((score / 100) * assessment.totalQuestions)
    : null

  return (
    <div className="text-center">
      {/* Pass / fail icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className={cn(
          'inline-flex items-center justify-center w-16 h-16 rounded-full mb-4',
          hasPassed ? 'bg-emerald-100' : 'bg-red-100',
        )}
      >
        {hasPassed ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        ) : (
          <XCircle className="w-8 h-8 text-red-500" />
        )}
      </motion.div>

      <h3 className="text-xl font-black text-brand-text-primary">
        {hasPassed ? 'You passed!' : 'Not quite yet'}
      </h3>

      {assessment.isGraded && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatBox label="Your score" value={`${score}%`} />
          <StatBox label="Passing score" value={`${assessment.passingScore}%`} />
          {correct !== null && (
            <StatBox label="Correct" value={`${correct}/${assessment.totalQuestions}`} />
          )}
        </div>
      )}

      {/* Correct answers */}
      {assessment.showAnswers && correctAnswers && correctAnswers.length > 0 && (
        <div className="mt-5 text-left">
          <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em] mb-2">Correct answers</p>
          <div className="space-y-2">
            {correctAnswers.map((ca, i) => (
              <div key={i} className="rounded-xl border border-brand-surface-2 bg-brand-surface px-4 py-3 text-sm">
                <p className="font-semibold text-brand-text-primary leading-snug">{ca.questionText}</p>
                <p className="mt-1 text-brand-text-muted">
                  Correct answer: option {ca.correctAnswer + 1}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        {!hasPassed && attemptsRemaining !== 0 && (
          <button
            onClick={onRetake}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake
          </button>
        )}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-brand-surface-2 px-5 py-2.5 text-xs font-bold text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary transition-all"
        >
          Back to course
        </button>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AssessmentView({ assessmentId, isLocked, onCompleted }: Props) {
  const queryClient = useQueryClient()
  const [viewState, setViewState] = useState<ViewState>('summary')
  const [resultSummary, setResultSummary] = useState<AssessmentSummary | null>(null)

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['assessment-summary', assessmentId],
    queryFn: () => fetchAssessmentSummary(assessmentId),
  })

  const submitMutation = useMutation({
    mutationFn: (answers: Record<string, number>) =>
      apiSubmitAssessmentAttempt(assessmentId, answers),
    onSuccess: (data) => {
      setResultSummary(data)
      setViewState('result')
      queryClient.invalidateQueries({ queryKey: ['assessment-summary', assessmentId] })
      // Notify parent if assessment was completed (passed or ungraded)
      if (data.hasPassed || !data.assessment.isGraded) {
        onCompleted?.()
      }
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white border border-brand-surface-2 p-6 shadow-sm space-y-3 animate-pulse">
        <div className="h-4 bg-brand-surface-2 rounded w-20" />
        <div className="h-6 bg-brand-surface-2 rounded w-1/2" />
        <div className="h-4 bg-brand-surface-2 rounded w-3/4" />
        <div className="grid grid-cols-4 gap-3 pt-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-brand-surface-2 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <div className="rounded-2xl bg-white border border-brand-surface-2 p-6 shadow-sm text-center text-sm text-brand-text-muted">
        Failed to load assessment. Please refresh the page.
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white border border-brand-surface-2 p-6 shadow-sm">
      <AnimatePresence mode="wait">
        {viewState === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SummaryView
              summary={summary}
              isLocked={isLocked}
              onStart={() => setViewState('taking')}
            />
          </motion.div>
        )}
        {viewState === 'taking' && (
          <motion.div
            key="taking"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            <TakingView
              assessmentId={assessmentId}
              onSubmit={(answers) => submitMutation.mutate(answers)}
              onBack={() => setViewState('summary')}
            />
            {submitMutation.isPending && (
              <div className="mt-4 text-center text-xs text-brand-text-muted animate-pulse">
                Submitting your answers…
              </div>
            )}
            {submitMutation.isError && (
              <div className="mt-4 text-center text-xs text-red-600">
                Submission failed. Please try again.
              </div>
            )}
          </motion.div>
        )}
        {viewState === 'result' && resultSummary && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ResultView
              summary={resultSummary}
              onRetake={() => setViewState('taking')}
              onBack={() => setViewState('summary')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
