'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, Pencil, Trash2 } from 'lucide-react'
import type { BlockQuestion, LearningBlock } from '@/lib/api/lms'
import type { AdminQuestion } from '@/lib/adminData'
import { IconButton, Pill } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { blockDisplay, htmlToText, isActionPlanBlock, richTextClass } from './shared'
import { QuestionsList, adminQuestionsToBlockQuestions, blockQuestionsToAdminQuestions } from './BlockEditor'

/** Long text blocks start collapsed to keep the unit scannable. */
export function defaultCollapsed(b: LearningBlock) {
  return b.type === 'text' && (b.body?.length ?? 0) > 1200
}

function excerpt(b: LearningBlock) {
  if (b.type === 'text') return htmlToText(b.body) || 'No content yet.'
  if (b.type === 'video') return b.videoUrl || 'No video URL yet.'
  if (b.type === 'image') return b.imageUrl || 'No image yet.'
  const n = b.questions.length
  if (isActionPlanBlock(b)) return `${n} ${n === 1 ? 'prompt' : 'prompts'}`
  return `${n} ${n === 1 ? 'question' : 'questions'}`
}

const labelClass = 'text-[13px] font-semibold text-ui-text'
const emptyClass = 'rounded-[10px] border border-dashed border-ui-line px-3 py-2.5 text-[13px] text-ui-muted'

/**
 * One learning block on the course editor canvas: a read view of its content
 * (questions are managed inline), with drag, collapse, edit and delete.
 */
export function BlockCard({
  block,
  collapsed,
  onToggleCollapsed,
  onEdit,
  onDelete,
  onQuestionsChange,
}: {
  block: LearningBlock
  collapsed: boolean
  onToggleCollapsed: () => void
  onEdit: () => void
  onDelete: () => void
  onQuestionsChange: (qs: BlockQuestion[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  const display = blockDisplay(block)
  const Icon = display.icon
  const name = block.title || display.label

  return (
    <article
      id={`block-${block.id}`}
      ref={setNodeRef}
      style={style}
      aria-label={`${display.label} block: ${name}`}
      className="scroll-mt-6 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface"
    >
      <header className="flex items-center gap-2.5 border-b border-ui-line py-2.5 pl-3.5 pr-3">
        <button
          type="button"
          aria-label={`Reorder ${name} block`}
          title="Drag to reorder"
          className="inline-flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-ui-muted hover:text-ui-text active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ui-brand"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <Pill tone={display.tone}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {display.label}
        </Pill>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ui-text">{name}</h3>
        {collapsed && <span className="hidden text-xs text-ui-muted sm:inline">Collapsed</span>}
        <span className="flex items-center">
          <IconButton
            label={`${collapsed ? 'Expand' : 'Collapse'} ${name} block`}
            icon={collapsed ? ChevronDown : ChevronUp}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          />
          <IconButton label={`Edit ${name} block`} icon={Pencil} onClick={onEdit} />
          <IconButton label={`Delete ${name} block`} icon={Trash2} tone="danger" onClick={onDelete} />
        </span>
      </header>

      {collapsed ? (
        <p className="truncate px-3.5 py-2.5 text-[13px] text-ui-muted">{excerpt(block)}</p>
      ) : (
        <BlockBody block={block} onQuestionsChange={onQuestionsChange} />
      )}
    </article>
  )
}

function BlockBody({
  block,
  onQuestionsChange,
}: {
  block: LearningBlock
  onQuestionsChange: (qs: BlockQuestion[]) => void
}) {
  if (block.type === 'question') {
    return (
      <QuestionsList
        value={{ type: 'question', questions: blockQuestionsToAdminQuestions(block.questions) }}
        onChange={(qs: AdminQuestion[]) => onQuestionsChange(adminQuestionsToBlockQuestions(qs, block.id))}
        blockId={block.id}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3.5">
      {block.type === 'text' && (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Body</span>
          {htmlToText(block.body) ? (
            <div
              className={cn(richTextClass, 'rounded-[10px] border border-ui-line px-3.5 py-3')}
              dangerouslySetInnerHTML={{ __html: block.body ?? '' }}
            />
          ) : (
            <p className={emptyClass}>No content yet. Edit the block to write it.</p>
          )}
        </div>
      )}

      {block.type === 'video' && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Video URL</span>
            {block.videoUrl ? (
              <a
                href={block.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate rounded-[10px] border border-ui-line bg-ui-surface-2 px-3 py-2.5 text-sm text-ui-text hover:underline"
              >
                {block.videoUrl}
              </a>
            ) : (
              <p className={emptyClass}>No video URL yet.</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Video transcript</span>
            {htmlToText(block.transcript) ? (
              <p className="line-clamp-4 rounded-[10px] border border-ui-line px-3.5 py-3 text-sm leading-relaxed text-ui-text">
                {htmlToText(block.transcript)}
              </p>
            ) : (
              <p className={emptyClass}>No transcript.</p>
            )}
          </div>
        </>
      )}

      {block.type === 'image' && (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Image</span>
          {block.imageUrl ? (
            <img
              src={block.imageUrl}
              alt=""
              className="max-h-64 w-auto max-w-full self-start rounded-[10px] border border-ui-line object-contain"
            />
          ) : (
            <p className={emptyClass}>No image yet.</p>
          )}
        </div>
      )}

    </div>
  )
}
