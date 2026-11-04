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
            'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
            isPre
              ? 'bg-ui-brand-soft text-ui-brand-text'
              : 'bg-ui-brand-soft text-ui-brand-text',
          )}
        >
          {isPre ? 'Pre-Test' : 'Post-Test'}
        </span>
        {hasPassed && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ui-ok-soft text-ui-ok text-xs font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            Passed
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-ui-text leading-tight">{assessment.title}</h3>
      {assessment.description && (
        <p className="mt-1.5 text-sm text-ui-muted leading-relaxed">{assessment.description}</p>
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
            value={bestScore !== null ? `${bestScore}%` : 'None yet'}
          />
          <StatBox label="Passing score" value={`${assessment.passingScore}%`} />
        </div>
      )}

      {/* Latest attempt */}
      {latestAttempt && (
        <div
          className={cn(
            'mt-4 flex items-center gap-3 rounded-[10px] border px-4 py-3 text-sm',
            latestAttempt.passed
              ? 'bg-ui-ok-soft border-transparent text-ui-ok'
              : 'bg-ui-danger-soft border-transparent text-ui-danger',
          )}
        >
          {latestAttempt.passed ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="font-semibold">
            {latestAttempt.passed ? 'Passed' : 'Did not pass'}, attempt {latestAttempt.attemptNumber}
            {latestAttempt.score !== null && `, ${latestAttempt.score}%`}
          </span>
        </div>
      )}

      {/* Locked state */}
      {isLocked && (
        <div className="mt-5 flex items-center gap-3 rounded-[10px] border border-ui-line bg-ui-bg px-4 py-3 text-sm text-ui-muted">
          <Lock className="w-4 h-4 shrink-0" />
          Complete previous sections first to unlock this assessment.
        </div>
      )}

      {/* No attempts remaining */}
      {!isLocked && !canStartAssessment && !hasPassed && attemptsMade > 0 && (
        <div className="mt-5 rounded-[10px] border border-transparent bg-ui-danger-soft px-4 py-3 text-sm text-ui-danger">
          You have used all available attempts and did not reach the passing score.
        </div>
      )}

      {/* Start / Retake button */}
      {!isLocked && canStartAssessment && (
        <div className="mt-5">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-10 px-5 text-sm font-semibold transition-all"
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
    <div className="rounded-[10px] border border-ui-line bg-ui-bg px-3 py-2.5 text-center">
      <p className="text-base font-semibold text-ui-text">{value}</p>
      <p className="text-xs text-ui-muted mt-0.5 leading-snug">{label}</p>
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
        <div className="h-4 bg-ui-surface-2 rounded w-24" />
        <div className="h-6 bg-ui-surface-2 rounded w-3/4" />
        <div className="h-12 bg-ui-surface-2 rounded" />
        <div className="h-12 bg-ui-surface-2 rounded" />
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
      <div className="flex items-center justify-between text-xs font-bold text-ui-muted mb-4">
        <span>Question {currentIdx + 1} of {total}</span>
        <span>{Object.keys(answers).length}/{total} answered</span>
      </div>
      <div className="h-1.5 rounded-full bg-ui-surface-2 overflow-hidden mb-6">
        <motion.div
          animate={{ width: `${((currentIdx + 1) / total) * 100}%` }}
          transition={{ duration: 0.3 }}
          className="h-full rounded-full bg-ui-brand"
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
          <p className="text-base sm:text-lg font-semibold text-ui-text leading-relaxed mb-4">
            {q.questionText}
          </p>

          <div className="grid gap-2" role="radiogroup" aria-label={q.questionText}>
            {options.map((opt, idx) => {
              const isSelected = answers[q.id] === idx
              return (
                <motion.button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    'relative text-left flex items-center gap-3 rounded-[10px] border px-4 py-3 text-sm transition-all',
                    isSelected
                      ? 'border-ui-brand bg-ui-brand-soft text-ui-text shadow-sm'
                      : 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand',
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
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-ui-brand-text" />}
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
          className="inline-flex items-center gap-2 rounded-[10px] bg-ui-surface border border-ui-line h-10 px-4 text-sm font-semibold text-ui-text hover:border-ui-brand hover:text-ui-brand-text transition-all"
        >
          {currentIdx === 0 ? 'Cancel' : 'Previous'}
        </button>

        {!isLast ? (
          <button
            onClick={() => setCurrentIdx((i) => i + 1)}
            disabled={answers[q.id] === undefined}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-10 px-5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => onSubmit(answers)}
            disabled={!allAnswered}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-10 px-5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
          hasPassed ? 'bg-ui-ok-soft' : 'bg-ui-danger-soft',
        )}
      >
        {hasPassed ? (
          <CheckCircle2 className="w-8 h-8 text-ui-ok" />
        ) : (
          <XCircle className="w-8 h-8 text-ui-danger" />
        )}
      </motion.div>

      <h3 className="text-xl font-semibold text-ui-text">
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
          <p className="text-xs font-bold text-ui-brand-text mb-2">Correct answers</p>
          <div className="space-y-2">
            {correctAnswers.map((ca, i) => (
              <div key={i} className="rounded-[10px] border border-ui-line bg-ui-bg px-4 py-3 text-sm">
                <p className="font-semibold text-ui-text leading-snug">{ca.questionText}</p>
                <p className="mt-1 text-ui-muted">
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
            className="inline-flex items-center gap-2 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-10 px-5 text-sm font-semibold transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake
          </button>
        )}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-[10px] bg-ui-surface border border-ui-line h-10 px-5 text-sm font-semibold text-ui-text hover:border-ui-brand hover:text-ui-brand-text transition-all"
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

  const { data: summary, isLoading, isError, error } = useQuery({
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
      <div className="rounded-[14px] bg-ui-surface border border-ui-line p-6 shadow-sm space-y-3 animate-pulse">
        <div className="h-4 bg-ui-surface-2 rounded w-20" />
        <div className="h-6 bg-ui-surface-2 rounded w-1/2" />
        <div className="h-4 bg-ui-surface-2 rounded w-3/4" />
        <div className="grid grid-cols-4 gap-3 pt-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-ui-surface-2 rounded-[10px]" />)}
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <div className="rounded-[14px] bg-ui-surface border border-ui-line p-6 shadow-sm text-center text-sm text-ui-muted">
        {error instanceof Error ? error.message : 'This exam could not load.'} Please refresh the page.
      </div>
    )
  }

  return (
    <div className="rounded-[14px] bg-ui-surface border border-ui-line p-6 shadow-sm">
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
              <div className="mt-4 text-center text-xs text-ui-muted animate-pulse">
                Submitting your answers…
              </div>
            )}
            {submitMutation.isError && (
              <div role="alert" className="mt-4 text-center text-sm text-ui-danger">
                {submitMutation.error instanceof Error ? submitMutation.error.message : 'Your answers could not be sent.'} Please try again.
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
