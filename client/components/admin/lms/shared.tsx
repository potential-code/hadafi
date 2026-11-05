'use client'

import { ClipboardList, FileText, HelpCircle, ImageIcon, Video, type LucideIcon } from 'lucide-react'
import { btn, inputClass } from '@/components/kit'
import { cn } from '@/lib/utils'

export type BlockType = 'text' | 'video' | 'image' | 'question'

export const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  text: FileText,
  video: Video,
  question: HelpCircle,
  image: ImageIcon,
}
export const BLOCK_LABEL: Record<BlockType, string> = {
  text: 'Text',
  video: 'Video',
  question: 'Question',
  image: 'Image',
}
export const BLOCK_TONE: Record<BlockType, 'neutral' | 'brand' | 'ok'> = {
  text: 'neutral',
  video: 'neutral',
  image: 'neutral',
  question: 'brand',
}

/**
 * A question block whose questions are all Action Plan prompts. The learner
 * player shows it as an action plan (one written answer per prompt) rather
 * than a check-in, so the editor names it the same way.
 */
export function isActionPlanBlock(b: { type: string; questions?: { kind: string }[] | null }) {
  const qs = b.questions ?? []
  return b.type === 'question' && qs.length > 0 && qs.every((q) => q.kind === 'action-plan')
}

/** Label, icon and pill tone for a block as learners will see it. */
export function blockDisplay(b: { type: BlockType; questions?: { kind: string }[] | null }): {
  label: string
  icon: LucideIcon
  tone: 'neutral' | 'brand' | 'ok'
} {
  if (isActionPlanBlock(b)) return { label: 'Action plan', icon: ClipboardList, tone: 'brand' }
  return { label: BLOCK_LABEL[b.type], icon: BLOCK_ICON[b.type], tone: BLOCK_TONE[b.type] }
}

/** Text input / select / textarea look for the course editor (kit input). */
export const fieldClass = inputClass
export const textareaClass = cn(inputClass, 'h-auto min-h-10 resize-y py-2.5 leading-relaxed')
export const selectFieldClass = cn(
  inputClass,
  'appearance-none bg-[length:16px_16px] bg-[position:right_10px_center] bg-no-repeat pr-9 bg-[image:url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238a8a96%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)]',
)

/** Typography for stored lesson HTML (editor and previews), token coloured for dark mode. */
export const richTextClass =
  'prose prose-sm max-w-none text-ui-text [--tw-prose-body:var(--ui-text)] [--tw-prose-headings:var(--ui-text)] [--tw-prose-bold:var(--ui-text)] [--tw-prose-links:var(--ui-brand-text)] [--tw-prose-bullets:var(--ui-muted)] [--tw-prose-counters:var(--ui-muted)] [--tw-prose-quotes:var(--ui-text)] [--tw-prose-quote-borders:var(--ui-line)] [--tw-prose-hr:var(--ui-line)] prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0'

/** Cancel + Save buttons for a `Modal` footer; Save submits the form with `formId`. */
export function DialogActions({
  formId,
  onCancel,
  saveLabel = 'Save',
  saving,
}: {
  formId: string
  onCancel: () => void
  saveLabel?: string
  saving?: boolean
}) {
  return (
    <>
      <button type="button" onClick={onCancel} className={btn({ variant: 'secondary', size: 'sm' })}>
        Cancel
      </button>
      <button type="submit" form={formId} disabled={saving} className={btn({ size: 'sm' })}>
        {saving ? 'Saving…' : saveLabel}
      </button>
    </>
  )
}

/** Stack of label + control used in the editor's forms. */
export function FormField({
  label,
  hint,
  children,
  asDiv,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  asDiv?: boolean
  className?: string
}) {
  const Comp = asDiv ? 'div' : 'label'
  return (
    <Comp className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-semibold text-ui-text">{label}</span>
      {children}
      {hint && <span className="text-xs text-ui-muted">{hint}</span>}
    </Comp>
  )
}

/** Plain-text excerpt of stored HTML. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return ''
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The server's message for a failed request (lib/api/lms reads `error.message`). */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.') {
  return e instanceof Error && e.message ? e.message : fallback
}
