'use client'

import { useEffect, useId, useState } from 'react'
import { ClipboardList, Plus, Trash2, Pencil, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import {
  newActionPlanBlock,
  newBlock,
  newQuestion,
  type AdminLearningBlock,
  type AdminQuestion,
  type AdminQuestionBlock,
  type AdminQuestionFormat,
  type AdminQuestionKind,
} from '@/lib/adminData'
import {
  apiCreateBlockQuestion,
  apiUpdateBlockQuestion,
  apiDeleteBlockQuestion,
  type LearningBlock,
  type BlockQuestion,
} from '@/lib/api/lms'
import type { MediaFile } from '@/lib/api/media'
import { cn } from '@/lib/utils'
import { Button, btn } from '@/components/kit'
import { IconButton, Modal, Pill, Segmented, Tag } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { RichTextEditor } from '@/components/admin/widgets/RichTextEditor'
import MediaPicker from '@/components/admin/MediaPicker'
import {
  BLOCK_ICON,
  BLOCK_LABEL,
  DialogActions,
  errorMessage,
  isActionPlanBlock,
  FormField,
  fieldClass,
  selectFieldClass,
  textareaClass,
  type BlockType,
} from './shared'
import { API_BASE } from '@/lib/api'

const SERVER_URL = API_BASE

export const KIND_LABEL: Record<AdminQuestionKind, string> = {
  survey: 'Survey',
  'action-plan': 'Action Plan',
}
export const FORMAT_LABEL: Record<AdminQuestionFormat, string> = {
  'multiple-choice': 'Multiple choice',
  'true-false': 'True or false',
  'short-text': 'Open ended',
}

type PickerType = BlockType | 'action-plan'
const PICKER_TYPES: PickerType[] = ['text', 'video', 'image', 'question', 'action-plan']

// ─── Converters between the API block and the editor's form shape ─────────────

export function adminBlockToLearningBlock(a: AdminLearningBlock): LearningBlock {
  const base = {
    id: a.id,
    unitId: '',
    title: a.title,
    order: 0,
    body: null,
    videoUrl: null,
    transcript: null,
    imageUrl: null,
    questions: [] as BlockQuestion[],
  }
  if (a.type === 'text') {
    return { ...base, type: 'text', body: a.body }
  }
  if (a.type === 'video') {
    return {
      ...base,
      type: 'video',
      videoUrl: a.videoUrl,
      transcript: a.transcript ?? null,
    }
  }
  if (a.type === 'image') {
    return { ...base, type: 'image', imageUrl: a.imageUrl }
  }
  // question
  return {
    ...base,
    type: 'question',
    questions: adminQuestionsToBlockQuestions(a.questions ?? []),
  }
}

export function adminQuestionsToBlockQuestions(qs: AdminQuestion[], blockId = ''): BlockQuestion[] {
  return qs.map((q, i) => ({
    id: q.id,
    blockId,
    kind: q.kind,
    format: q.format,
    prompt: q.prompt,
    options: q.options ?? null,
    correctIndex: q.correctIndex ?? null,
    correctBool: q.correctBool ?? null,
    placeholder: q.placeholder ?? null,
    order: i,
  }))
}

export function blockQuestionsToAdminQuestions(qs: BlockQuestion[]): AdminQuestion[] {
  return qs.map((q) => ({
    id: q.id,
    kind: q.kind,
    format: q.format,
    prompt: q.prompt,
    options: q.options ?? undefined,
    correctIndex: q.correctIndex ?? undefined,
    correctBool: q.correctBool ?? undefined,
    placeholder: q.placeholder ?? undefined,
  }))
}

export function learningBlockToAdminBlock(b: LearningBlock): AdminLearningBlock {
  if (b.type === 'text') {
    return { id: b.id, title: b.title, type: 'text', body: b.body ?? '' }
  }
  if (b.type === 'video') {
    return {
      id: b.id,
      title: b.title,
      type: 'video',
      videoUrl: b.videoUrl ?? '',
      transcript: b.transcript ?? '',
    }
  }
  if (b.type === 'image') {
    return {
      id: b.id,
      title: b.title,
      type: 'image',
      imageUrl: b.imageUrl ?? '',
    }
  }
  return {
    id: b.id,
    title: b.title,
    type: 'question',
    questions: blockQuestionsToAdminQuestions(b.questions),
  }
}

// ─── Block dialog ─────────────────────────────────────────────────────────────

export function BlockDialog({
  open,
  initial,
  blockId,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: LearningBlock
  blockId?: string
  onClose: () => void
  onSave: (b: LearningBlock) => void
}) {
  const formId = useId()
  const initialAdmin = initial ? learningBlockToAdminBlock(initial) : undefined
  const [form, setForm] = useState<AdminLearningBlock>(initialAdmin ?? newBlock('text'))
  const [mediaPickerTarget, setMediaPickerTarget] = useState<null | 'videoUrl' | 'imageUrl'>(null)

  useEffect(() => {
    if (open) {
      setForm(initial ? learningBlockToAdminBlock(initial) : newBlock('text'))
    }
  }, [open, initial])

  // "Action plan" is a question block whose questions are all Action Plan
  // prompts (the learner player shows those as written answers). Offered as
  // its own choice so a new block can start as one.
  const choice: PickerType = form.type === 'question' && isActionPlanBlock(form) ? 'action-plan' : form.type

  function setType(t: PickerType) {
    if (t === choice) return
    // An existing question block's questions are saved one by one; change each
    // question's kind below instead of swapping the whole set.
    if (blockId && form.type === 'question' && (t === 'question' || t === 'action-plan')) return
    setForm(t === 'action-plan' ? { ...newActionPlanBlock(), title: form.title } : newBlock(t, form.title))
  }

  function patch<K extends keyof AdminLearningBlock>(k: K, v: AdminLearningBlock[K]) {
    setForm((f) => ({ ...f, [k]: v }) as AdminLearningBlock)
  }

  return (
    <Modal
      open={open}
      size="lg"
      title={initial ? 'Edit learning block' : 'New learning block'}
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(adminBlockToLearningBlock(form))
        }}
        className="flex flex-col gap-4"
      >
        <FormField label="Block type" asDiv>
          <div role="group" aria-label="Block type" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PICKER_TYPES.map((t) => {
              const Icon = t === 'action-plan' ? ClipboardList : BLOCK_ICON[t]
              const active = choice === t
              const locked =
                !active && !!blockId && form.type === 'question' && (t === 'question' || t === 'action-plan')
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  disabled={locked}
                  title={locked ? "Change each question's kind below" : undefined}
                  onClick={() => setType(t)}
                  className={cn(
                    'inline-flex flex-col items-center gap-1.5 rounded-[10px] border px-2 py-3 text-[13px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
                    active
                      ? 'border-ui-brand bg-ui-brand-soft text-ui-brand-text'
                      : 'border-ui-line bg-ui-surface text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {t === 'action-plan' ? 'Action plan' : t === 'question' ? 'Survey' : BLOCK_LABEL[t]}
                </button>
              )
            })}
          </div>
        </FormField>

        <FormField label={form.type === 'question' ? 'Title (optional)' : 'Title'}>
          <input
            value={form.title}
            onChange={(e) => patch('title', e.target.value)}
            className={fieldClass}
            required={form.type !== 'question'}
          />
        </FormField>

        {form.type === 'text' && (
          <FormField label="Body" asDiv>
            <RichTextEditor
              value={(form as AdminLearningBlock & { body: string }).body}
              onChange={(html) => setForm({ ...form, body: html } as AdminLearningBlock)}
              placeholder="Write your lesson content here"
            />
          </FormField>
        )}

        {form.type === 'video' && (
          <>
            <FormField label="Video URL" asDiv>
              <div className="flex gap-2">
                <input
                  aria-label="Video URL"
                  value={(form as AdminLearningBlock & { videoUrl: string }).videoUrl}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      videoUrl: e.target.value,
                    } as AdminLearningBlock)
                  }
                  className={fieldClass}
                  placeholder="https://…/video.mp4 or browse the library"
                />
                <BrowseButton onClick={() => setMediaPickerTarget('videoUrl')} />
              </div>
            </FormField>
            <FormField label="Video transcript (optional)" asDiv>
              <RichTextEditor
                value={(form as AdminLearningBlock & { transcript?: string }).transcript ?? ''}
                onChange={(html) => setForm({ ...form, transcript: html } as AdminLearningBlock)}
                placeholder="Paste or write the video transcript here"
              />
            </FormField>
          </>
        )}

        {form.type === 'image' && (
          <FormField label="Image URL" asDiv>
            <div className="flex gap-2">
              <input
                aria-label="Image URL"
                value={(form as AdminLearningBlock & { imageUrl: string }).imageUrl ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    imageUrl: e.target.value,
                  } as AdminLearningBlock)
                }
                className={fieldClass}
                placeholder="https://…/image.jpg or browse the library"
              />
              <BrowseButton onClick={() => setMediaPickerTarget('imageUrl')} />
            </div>
          </FormField>
        )}

        {form.type === 'question' && (
          <QuestionsList
            value={form as AdminLearningBlock & AdminQuestionBlock}
            onChange={(qs) => setForm({ ...form, questions: qs } as AdminLearningBlock)}
            blockId={blockId}
            className="rounded-[10px] border border-ui-line"
          />
        )}
      </form>
      <MediaPicker
        open={mediaPickerTarget !== null}
        onClose={() => setMediaPickerTarget(null)}
        accept={mediaPickerTarget === 'videoUrl' ? 'video' : 'image'}
        onSelect={(file: MediaFile) => {
          const url = `${SERVER_URL}/${file.path}`
          if (mediaPickerTarget === 'videoUrl') {
            setForm({ ...form, videoUrl: url } as AdminLearningBlock)
          } else if (mediaPickerTarget === 'imageUrl') {
            setForm({ ...form, imageUrl: url } as AdminLearningBlock)
          }
          setMediaPickerTarget(null)
        }}
      />
    </Modal>
  )
}

export function BrowseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Browse media library"
      className={cn(btn({ variant: 'secondary' }), 'px-3', className)}
    >
      <FolderOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      Browse
    </button>
  )
}

// ─── Question block questions (inline on the block card and in the dialog) ────

export function QuestionsList({
  value,
  onChange,
  blockId,
  className,
}: {
  value: AdminQuestionBlock
  onChange: (qs: AdminQuestion[]) => void
  /** When set, edits persist to the API immediately. */
  blockId?: string
  className?: string
}) {
  const [editing, setEditing] = useState<{
    q: AdminQuestion
    index: number | null
  } | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)
  const qs = value.questions
  const actionPlan = qs.length > 0 && qs.every((q) => q.kind === 'action-plan')
  const mixed = qs.some((q) => q.kind === 'action-plan') && qs.some((q) => q.kind === 'survey')

  function addQuestion() {
    // In an action plan, the next item is another prompt.
    setEditing({
      q: newQuestion(actionPlan ? 'action-plan' : 'survey'),
      index: null,
    })
  }

  async function saveQuestion(q: AdminQuestion) {
    if (!editing) return
    if (blockId) {
      try {
        if (editing.index === null) {
          const created = await apiCreateBlockQuestion(blockId, {
            kind: q.kind,
            format: q.format,
            prompt: q.prompt,
            options: q.options ?? null,
            correctIndex: q.correctIndex ?? null,
            correctBool: q.correctBool ?? null,
            placeholder: q.placeholder ?? null,
          })
          onChange([...value.questions, { ...q, id: created.id }])
        } else {
          await apiUpdateBlockQuestion(q.id, {
            kind: q.kind,
            format: q.format,
            prompt: q.prompt,
            options: q.options ?? null,
            correctIndex: q.correctIndex ?? null,
            correctBool: q.correctBool ?? null,
            placeholder: q.placeholder ?? null,
          })
          onChange(value.questions.map((x, i) => (i === editing.index ? q : x)))
        }
      } catch (e) {
        toast.error(errorMessage(e))
        return
      }
    } else {
      const list = [...value.questions]
      if (editing.index === null) list.push(q)
      else list[editing.index] = q
      onChange(list)
    }
    setEditing(null)
  }

  async function removeQuestion(i: number) {
    const q = value.questions[i]
    if (blockId && q.id) {
      try {
        await apiDeleteBlockQuestion(q.id)
      } catch (e) {
        toast.error(errorMessage(e))
        setConfirmDeleteIndex(null)
        return
      }
    }
    onChange(value.questions.filter((_, idx) => idx !== i))
    setConfirmDeleteIndex(null)
  }

  return (
    <div className={cn('flex flex-col gap-2 bg-ui-bg p-3.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ui-text">
          {actionPlan ? 'Action plan prompts' : 'Questions'} ({qs.length})
        </span>
        <Button type="button" variant="secondary" size="sm" className="h-7" onClick={addQuestion}>
          <Plus className="h-4 w-4" aria-hidden />
          {actionPlan ? 'Add prompt' : 'Add question'}
        </Button>
      </div>

      {actionPlan && (
        <p className="text-xs text-ui-muted">
          Learners write an answer to each prompt. Every answer goes into their action plan, which they can download.
        </p>
      )}
      {mixed && (
        <p className="text-xs text-ui-muted">
          This block mixes survey questions and action plan prompts, so learners see it as a check-in. Put action plan
          prompts in a block of their own to show them as an action plan.
        </p>
      )}

      {qs.length === 0 && <p className="py-3 text-center text-[13px] text-ui-muted">No questions yet.</p>}

      {value.questions.map((q, i) => {
        const opts =
          q.kind === 'action-plan'
            ? []
            : q.format === 'multiple-choice'
              ? (q.options ?? [])
              : q.format === 'true-false'
                ? ['True', 'False']
                : []
        return (
          <div
            key={q.id}
            className="flex items-start gap-2.5 rounded-[10px] border border-ui-line bg-ui-surface py-2.5 pl-3 pr-1.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-wrap gap-1.5">
                <Tag className="bg-ui-brand-soft text-ui-brand-text">{KIND_LABEL[q.kind]}</Tag>
                <Tag>{q.kind === 'action-plan' ? 'Written answer' : FORMAT_LABEL[q.format]}</Tag>
              </span>
              <span className="text-sm font-medium text-ui-text">{q.prompt || 'Untitled question'}</span>
              {opts.length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {opts.map((o, oi) => (
                    <Pill key={oi} tone="line">
                      {o}
                    </Pill>
                  ))}
                </span>
              )}
            </div>
            <IconButton
              label={`Edit ${q.kind === 'action-plan' ? 'prompt' : 'question'} ${i + 1}`}
              icon={Pencil}
              onClick={() => setEditing({ q, index: i })}
            />
            <IconButton
              label={`Delete ${q.kind === 'action-plan' ? 'prompt' : 'question'} ${i + 1}`}
              icon={Trash2}
              tone="danger"
              onClick={() => setConfirmDeleteIndex(i)}
            />
          </div>
        )
      })}

      <QuestionDialog open={!!editing} initial={editing?.q} onClose={() => setEditing(null)} onSave={saveQuestion} />
      <ConfirmDialog
        open={confirmDeleteIndex !== null}
        title="Delete question"
        message="This question will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteIndex !== null && removeQuestion(confirmDeleteIndex)}
        onCancel={() => setConfirmDeleteIndex(null)}
      />
    </div>
  )
}

function QuestionDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: AdminQuestion
  onClose: () => void
  onSave: (q: AdminQuestion) => void | Promise<void>
}) {
  const formId = useId()
  const radioName = useId()
  const [q, setQ] = useState<AdminQuestion>(initial ?? newQuestion('survey'))
  useEffect(() => {
    if (open) setQ(initial ?? newQuestion('survey'))
  }, [open, initial])

  function patch<K extends keyof AdminQuestion>(k: K, v: AdminQuestion[K]) {
    setQ((prev) => ({ ...prev, [k]: v }))
  }

  const isPrompt = q.kind === 'action-plan'

  function setKind(kind: AdminQuestionKind) {
    setQ((prev) =>
      kind === 'action-plan'
        ? // Action Plan prompts are always answered in writing.
          {
            ...prev,
            kind,
            format: 'short-text',
            options: undefined,
            correctIndex: undefined,
            correctBool: undefined,
          }
        : { ...prev, kind },
    )
  }

  return (
    <Modal
      open={open}
      title={
        isPrompt
          ? initial
            ? 'Edit action plan prompt'
            : 'New action plan prompt'
          : initial
            ? 'Edit question'
            : 'New question'
      }
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSave(q)
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <FormField label="Kind">
            <select
              value={q.kind}
              onChange={(e) => setKind(e.target.value as AdminQuestionKind)}
              className={selectFieldClass}
            >
              <option value="survey">Survey</option>
              <option value="action-plan">Action Plan</option>
            </select>
          </FormField>
          {isPrompt ? (
            <FormField label="Answer format" asDiv>
              <p className="flex h-10 items-center rounded-[10px] border border-ui-line bg-ui-surface-2 px-3 text-sm text-ui-muted">
                Written answer
              </p>
            </FormField>
          ) : (
            <FormField label="Answer format">
              <select
                value={q.format}
                onChange={(e) => {
                  const newFormat = e.target.value as AdminQuestionFormat
                  setQ((prev) => ({
                    ...prev,
                    format: newFormat,
                    ...(newFormat === 'multiple-choice' && prev.correctIndex == null ? { correctIndex: 0 } : {}),
                  }))
                }}
                className={selectFieldClass}
              >
                <option value="multiple-choice">Multiple choice</option>
                <option value="true-false">True or false</option>
                <option value="short-text">Open ended</option>
              </select>
            </FormField>
          )}
        </div>

        <FormField label={isPrompt ? 'Prompt' : 'Question text'}>
          <textarea
            value={q.prompt}
            onChange={(e) => patch('prompt', e.target.value)}
            rows={2}
            className={textareaClass}
            required
          />
        </FormField>

        {q.format === 'multiple-choice' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ui-text">Options (mark the correct one)</legend>
            {(q.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioName}
                  checked={q.correctIndex === i}
                  onChange={() => patch('correctIndex', i)}
                  aria-label={`Mark option ${i + 1} as correct`}
                  className="h-4 w-4 shrink-0 accent-[var(--ui-brand)]"
                />
                <input
                  value={opt}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) => {
                    const next = [...(q.options ?? [])]
                    next[i] = e.target.value
                    patch('options', next)
                  }}
                  className={fieldClass}
                />
                <IconButton
                  label={`Remove option ${i + 1}`}
                  icon={Trash2}
                  tone="danger"
                  onClick={() =>
                    patch(
                      'options',
                      (q.options ?? []).filter((_, idx) => idx !== i),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch('options', [...(q.options ?? []), 'New option'])}
              className={btn({
                variant: 'ghost',
                size: 'sm',
                className: 'self-start text-ui-brand-text',
              })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add option
            </button>
          </fieldset>
        )}

        {q.format === 'true-false' && (
          <FormField label="Correct answer" asDiv>
            <Segmented
              label="Correct answer"
              value={q.correctBool === undefined ? '' : q.correctBool ? 'true' : 'false'}
              onChange={(v) => patch('correctBool', v === 'true')}
              options={[
                { value: 'true', label: 'True' },
                { value: 'false', label: 'False' },
              ]}
              className="self-start"
            />
          </FormField>
        )}

        {q.format === 'short-text' && (
          <FormField label="Placeholder (optional)">
            <input
              value={q.placeholder ?? ''}
              onChange={(e) => patch('placeholder', e.target.value)}
              className={fieldClass}
              placeholder="Hint shown in the empty answer box"
            />
          </FormField>
        )}
      </form>
    </Modal>
  )
}
