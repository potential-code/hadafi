'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, ClipboardList, ChevronDown, ChevronRight, BadgeCheck, CircleOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import {
  apiCreateAssessment,
  apiUpdateAssessment,
  apiDeleteAssessment,
  apiCreateAssessmentQuestion,
  apiUpdateAssessmentQuestion,
  apiDeleteAssessmentQuestion,
  type Assessment,
  type AssessmentQuestion,
} from '@/lib/api/lms'
import { AssessmentDialog } from './AssessmentDialog'
import { AssessmentQuestionDialog } from './AssessmentQuestionDialog'

type AssessmentFormData = Omit<Assessment, 'id' | 'courseId' | 'assessmentType' | 'questions'>
type QuestionFormData = Omit<AssessmentQuestion, 'id' | 'assessmentId' | 'order'>

export function AssessmentSection({
  courseId,
  type,
  assessment: initialAssessment,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  courseId: string
  type: 'pre' | 'post'
  assessment: Assessment | null
  onCreated: (a: Assessment) => void
  onUpdated: (a: Assessment) => void
  onDeleted: () => void
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(initialAssessment)
  const [questionsExpanded, setQuestionsExpanded] = useState(true)

  useEffect(() => { setAssessment(initialAssessment) }, [initialAssessment])
  const [showDialog, setShowDialog] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null)
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [confirmDeleteAssessment, setConfirmDeleteAssessment] = useState(false)
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState<string | null>(null)

  const label = type === 'pre' ? 'Pre-test' : 'Post-test'
  const labelDesc =
    type === 'pre'
      ? 'Shown before learners enter the course modules'
      : 'Shown after learners complete all modules'

  async function handleSaveAssessment(data: AssessmentFormData) {
    try {
      if (assessment) {
        const updated = await apiUpdateAssessment(assessment.id, data)
        const next = { ...assessment, ...updated, questions: assessment.questions }
        setAssessment(next)
        onUpdated(next)
        toast.success(`${label} updated`)
      } else {
        const created = await apiCreateAssessment(courseId, { ...data, assessmentType: type })
        setAssessment(created)
        onCreated(created)
        toast.success(`${label} created`)
      }
      setShowDialog(false)
    } catch {
      toast.error(`Failed to save ${label}`)
    }
  }

  async function handleDeleteAssessment() {
    if (!assessment) return
    try {
      await apiDeleteAssessment(assessment.id)
      setAssessment(null)
      onDeleted()
      toast.success(`${label} removed`)
    } catch {
      toast.error(`Failed to delete ${label}`)
    }
    setConfirmDeleteAssessment(false)
  }

  async function handleSaveQuestion(data: QuestionFormData) {
    if (!assessment) return
    try {
      if (editingQuestion) {
        const updated = await apiUpdateAssessmentQuestion(editingQuestion.id, data)
        const questions = assessment.questions.map(q => (q.id === editingQuestion.id ? updated : q))
        const next = { ...assessment, questions }
        setAssessment(next)
        onUpdated(next)
        toast.success('Question updated')
        setEditingQuestion(null)
      } else {
        const created = await apiCreateAssessmentQuestion(assessment.id, data)
        const next = { ...assessment, questions: [...assessment.questions, created] }
        setAssessment(next)
        onUpdated(next)
        toast.success('Question added')
        setAddingQuestion(false)
      }
    } catch {
      toast.error('Failed to save question')
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!assessment) return
    try {
      await apiDeleteAssessmentQuestion(questionId)
      const next = { ...assessment, questions: assessment.questions.filter(q => q.id !== questionId) }
      setAssessment(next)
      onUpdated(next)
      toast.success('Question removed')
    } catch {
      toast.error('Failed to delete question')
    }
    setConfirmDeleteQuestionId(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          type === 'pre'
            ? 'bg-brand-primary/5 border-b border-brand-primary/10'
            : 'bg-amber-500/5 border-b border-amber-500/10',
        )}
      >
        <div
          className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
            type === 'pre'
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'bg-amber-500/10 text-amber-700',
          )}
        >
          {type === 'pre' ? <ClipboardList className="w-4 h-4" /> : <BadgeCheck className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-text-primary text-sm">{label}</p>
          <p className="text-[11px] text-brand-text-muted">{labelDesc}</p>
        </div>
      </div>

      {/* No assessment yet */}
      {!assessment && (
        <div className="p-5 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-surface text-brand-text-muted mb-3">
            <CircleOff className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-brand-text-primary mb-1">
            No {label.toLowerCase()} yet
          </p>
          <p className="text-[11px] text-brand-text-muted mb-4">
            Add a {label.toLowerCase()} to test learners&apos; knowledge.
          </p>
          <button
            onClick={() => setShowDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add {label.toLowerCase()}
          </button>
        </div>
      )}

      {/* Assessment exists */}
      {assessment && (
        <>
          {/* Assessment metadata */}
          <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-brand-text-primary flex-1 min-w-0 truncate">
              {assessment.title}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                assessment.isGraded
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-brand-surface text-brand-text-muted',
              )}
            >
              {assessment.isGraded ? `Graded · ${assessment.passingScore}% to pass` : 'Ungraded'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-brand-surface text-[10px] font-bold text-brand-text-muted">
              {assessment.maxAttempts === 0
                ? 'Unlimited attempts'
                : `${assessment.maxAttempts} attempt${assessment.maxAttempts > 1 ? 's' : ''}`}
            </span>
            <button
              onClick={() => setShowDialog(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
              aria-label={`Edit ${label}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmDeleteAssessment(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
              aria-label={`Delete ${label}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Questions list */}
          <div className="px-4 pb-4">
            {/* Questions header with collapse toggle */}
            <button
              onClick={() => setQuestionsExpanded(e => !e)}
              className="w-full flex items-center justify-between mb-2 group"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted group-hover:text-brand-primary transition-colors">
                Questions ({assessment.questions.length})
              </p>
              <span className="text-brand-text-muted group-hover:text-brand-primary transition-colors">
                {questionsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {questionsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-1.5"
                >
                  {assessment.questions.length === 0 && (
                    <p className="text-[11px] text-brand-text-muted text-center py-3">
                      No questions yet — add one to get started.
                    </p>
                  )}

                  {assessment.questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex items-center gap-2 rounded-lg border border-brand-surface-2 bg-brand-surface/40 px-3 py-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-black flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-brand-text-primary flex-1 min-w-0 truncate">
                        {q.questionText || 'Untitled question'}
                      </span>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0',
                          q.questionType === 'multiple-choice'
                            ? 'bg-brand-violet/10 text-brand-violet'
                            : 'bg-amber-500/10 text-amber-700',
                        )}
                      >
                        {q.questionType === 'multiple-choice' ? 'MC' : 'T/F'}
                      </span>
                      <button
                        onClick={() => setEditingQuestion(q)}
                        className="w-6 h-6 rounded flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors flex-shrink-0"
                        aria-label={`Edit question ${i + 1}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteQuestionId(q.id)}
                        className="w-6 h-6 rounded flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors flex-shrink-0"
                        aria-label={`Delete question ${i + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => setAddingQuestion(true)}
                    className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary text-white text-[11px] font-bold hover:bg-brand-primary-dark transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add question
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </>
      )}

      <AssessmentDialog
        open={showDialog}
        type={type}
        initial={assessment ?? undefined}
        onClose={() => setShowDialog(false)}
        onSave={handleSaveAssessment}
      />
      <AssessmentQuestionDialog
        open={addingQuestion || !!editingQuestion}
        initial={editingQuestion ?? undefined}
        onClose={() => {
          setAddingQuestion(false)
          setEditingQuestion(null)
        }}
        onSave={handleSaveQuestion}
      />
      <ConfirmDialog
        open={confirmDeleteAssessment}
        title={`Delete ${label}`}
        message={`This will permanently remove the ${label.toLowerCase()} and all its questions.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteAssessment}
        onCancel={() => setConfirmDeleteAssessment(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteQuestionId}
        title="Delete question"
        message="This question will be permanently removed from the assessment."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteQuestionId && handleDeleteQuestion(confirmDeleteQuestionId)}
        onCancel={() => setConfirmDeleteQuestionId(null)}
      />
    </motion.div>
  )
}
