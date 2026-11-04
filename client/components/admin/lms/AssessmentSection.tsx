'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, FileCheck2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { IconButton, Tag } from '@/components/admin/ui'
import { Button } from '@/components/kit'
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
import { errorMessage } from './shared'

type AssessmentFormData = Omit<Assessment, 'id' | 'courseId' | 'assessmentType' | 'questions'>
type QuestionFormData = Omit<AssessmentQuestion, 'id' | 'assessmentId' | 'order'>

/**
 * One assessment (pre-test or post-test) as a row inside the course editor's
 * "Assessments" card: summary tags, expandable question list, and dialogs.
 */
export function AssessmentSection({
  courseId,
  type,
  assessment: initialAssessment,
  onCreated,
  onUpdated,
  onDeleted,
  defaultExpanded = true,
  className,
}: {
  courseId: string
  type: 'pre' | 'post'
  assessment: Assessment | null
  onCreated: (a: Assessment) => void
  onUpdated: (a: Assessment) => void
  onDeleted: () => void
  defaultExpanded?: boolean
  className?: string
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(initialAssessment)
  const [questionsExpanded, setQuestionsExpanded] = useState(defaultExpanded)

  useEffect(() => { setAssessment(initialAssessment) }, [initialAssessment])
  const [showDialog, setShowDialog] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null)
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [confirmDeleteAssessment, setConfirmDeleteAssessment] = useState(false)
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState<string | null>(null)

  const label = type === 'pre' ? 'Pre-test' : 'Post-test'
  const labelDesc =
    type === 'pre'
      ? 'Shown before learners enter the course modules.'
      : 'Shown after learners complete all modules.'
  const Icon = type === 'pre' ? ClipboardCheck : FileCheck2

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
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function handleDeleteAssessment() {
    if (!assessment) return
    try {
      await apiDeleteAssessment(assessment.id)
      setAssessment(null)
      onDeleted()
      toast.success(`${label} removed`)
    } catch (e) {
      toast.error(errorMessage(e))
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
    } catch (e) {
      toast.error(errorMessage(e))
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
    } catch (e) {
      toast.error(errorMessage(e))
    }
    setConfirmDeleteQuestionId(null)
  }

  const count = assessment?.questions.length ?? 0

  return (
    <div id={`assessment-${type}`} className={cn('flex scroll-mt-6 flex-col gap-3 px-5 py-3.5', className)}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            type === 'pre' ? 'bg-ui-surface-2 text-ui-muted' : 'bg-ui-brand-soft text-ui-brand-text',
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>

        {assessment ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ui-text">
                {label}: {assessment.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Tag>{assessment.isGraded ? `Graded, ${assessment.passingScore}% to pass` : 'Ungraded'}</Tag>
                {assessment.showAnswers && <Tag>Shows correct answers</Tag>}
                <Tag>
                  {assessment.maxAttempts === 0
                    ? 'Unlimited attempts'
                    : `${assessment.maxAttempts} attempt${assessment.maxAttempts > 1 ? 's' : ''}`}
                </Tag>
                {!questionsExpanded && <Tag>{count} {count === 1 ? 'question' : 'questions'}</Tag>}
              </div>
            </div>
            <IconButton
              label={`${questionsExpanded ? 'Collapse' : 'Expand'} ${label} questions`}
              icon={questionsExpanded ? ChevronUp : ChevronDown}
              aria-expanded={questionsExpanded}
              onClick={() => setQuestionsExpanded((e) => !e)}
            />
            <IconButton label={`Edit ${label}`} icon={Pencil} onClick={() => setShowDialog(true)} />
            <IconButton
              label={`Delete ${label}`}
              icon={Trash2}
              tone="danger"
              onClick={() => setConfirmDeleteAssessment(true)}
            />
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ui-text">No {label.toLowerCase()} yet</p>
              <p className="text-[13px] text-ui-muted">{labelDesc}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add {label.toLowerCase()}
            </Button>
          </>
        )}
      </div>

      {assessment && questionsExpanded && (
        <>
          {count === 0 ? (
            <p className="rounded-[10px] border border-dashed border-ui-line px-3 py-4 text-center text-[13px] text-ui-muted">
              No questions yet. Add one to get started.
            </p>
          ) : (
            <ol className="overflow-hidden rounded-[10px] border border-ui-line">
              {assessment.questions.map((q, i) => (
                <li
                  key={q.id}
                  className={cn('flex items-center gap-2.5 py-1 pl-3 pr-1.5', i > 0 && 'border-t border-ui-line')}
                >
                  <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-ui-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ui-text" title={q.questionText}>
                    {q.questionText || 'Untitled question'}
                  </span>
                  <Tag className="shrink-0">{q.questionType === 'multiple-choice' ? 'MC' : 'T/F'}</Tag>
                  <IconButton label={`Edit question ${i + 1}`} icon={Pencil} onClick={() => setEditingQuestion(q)} />
                  <IconButton
                    label={`Delete question ${i + 1}`}
                    icon={Trash2}
                    tone="danger"
                    onClick={() => setConfirmDeleteQuestionId(q.id)}
                  />
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddingQuestion(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add question
            </Button>
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
    </div>
  )
}
