'use client'

/**
 * "Report this answer" (ported from SMEEP): a learner tells the Hadafi team an
 * AI answer was wrong, harmful, inappropriate or unhelpful. It goes to
 * Admin → AI safety review with the answer, the conversation just before it
 * and the chat it came from (POST /api/ai-reports; the server ties it to the
 * signed-in learner).
 */
import { useId, useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/admin/ui'
import { btn, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

export type ReportTurn = { role: 'learner' | 'ai'; text: string }

const REASONS = [
  { value: 'wrong', label: 'Wrong or misleading', hint: 'A fact, figure or step is incorrect' },
  { value: 'harmful', label: 'Harmful or unsafe', hint: 'Advice that could hurt someone or their business' },
  { value: 'inappropriate', label: 'Inappropriate', hint: 'Offensive, biased or not suitable' },
  { value: 'unhelpful', label: 'Not helpful', hint: 'Off topic, or it didn’t answer the question' },
  { value: 'other', label: 'Something else', hint: '' },
] as const
type Reason = (typeof REASONS)[number]['value']

/** The last few turns before an answer, as plain text (hidden notes removed). */
export function excerptBefore(turns: ReportTurn[], max = 4): ReportTurn[] {
  return turns
    .map((t) => ({ role: t.role, text: t.text.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 2000) }))
    .filter((t) => t.text)
    .slice(-max)
}

export function ReportAnswerButton({
  surface,
  reply,
  question,
  excerpt,
  conversation,
  variant = 'icon',
  className,
}: {
  /** Which AI this is: "ask-hana", "mentor:<slug>". */
  surface: string
  /** The answer, as plain text. */
  reply: string
  /** What the learner asked, when known. */
  question?: string
  excerpt?: ReportTurn[]
  /** The chat's id in this browser (thread or session). */
  conversation?: string
  /** icon: a square icon button (Ask Hana); text: an icon and a label (AI mentors). */
  variant?: 'icon' | 'text'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reported, setReported] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const name = useId()
  const noteId = useId()
  const label = reported ? 'Reported' : 'Report this answer'

  async function send() {
    if (!reason) return
    setSending(true)
    try {
      await apiFetch('/api/ai-reports', {
        method: 'POST',
        body: JSON.stringify({
          surface,
          reason,
          note: note.trim() || null,
          reply,
          question: question ?? null,
          excerpt: excerpt ?? null,
          conversation: conversation && /^[\w-]{1,120}$/.test(conversation) ? conversation : null,
          page: window.location.pathname,
        }),
      })
      toast.success('Thank you for telling us', { description: 'The Hadafi team reviews every report.' })
      setReported(true)
      setOpen(false)
      setReason(null)
      setNote('')
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t send. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  if (!reply.trim()) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={reported}
        aria-label={label}
        title={label}
        className={cn(
          variant === 'icon'
            ? 'hana-action'
            : 'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
          reported && variant === 'icon' && 'is-on',
          className,
        )}
      >
        <Flag className={variant === 'icon' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={1.75} fill={reported ? 'currentColor' : 'none'} aria-hidden />
        {variant === 'text' && <span>{reported ? 'Reported' : 'Report'}</span>}
      </button>
      <Modal
        open={open}
        size="sm"
        title="Report this answer"
        description="What’s wrong with it? The Hadafi team reviews every report."
        onClose={sending ? () => {} : () => setOpen(false)}
        footer={
          <>
            <button type="button" className={btn({ variant: 'secondary' })} onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </button>
            <button type="button" className={btn()} onClick={send} disabled={!reason || sending}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Send report
            </button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors',
                reason === r.value ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line hover:bg-ui-surface-2',
              )}
            >
              <input
                type="radio"
                name={name}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--ui-brand)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ui-text">{r.label}</span>
                {r.hint && <span className="block text-xs text-ui-muted">{r.hint}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor={noteId} className="mt-3 block text-sm font-medium text-ui-text">
          Anything to add? <span className="font-normal text-ui-muted">(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          className={cn(inputClass, 'mt-1 h-auto min-h-[76px] py-2')}
          placeholder="For example: VAT in the UAE is 5%, not 20%."
        />
      </Modal>
    </>
  )
}
