'use client'

/**
 * "Write with AI": drafts pre-test or final-exam questions from the course's
 * own text (POST /api/admin/quiz/generate), shows them with the right answer
 * marked, and adds only the ones the admin keeps. Each added question can be
 * edited afterwards like any other. Ported from SMEEP 642cc49.
 */
import { useEffect, useState } from 'react'
import { Check, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Modal, Segmented } from '@/components/admin/ui'
import { Button } from '@/components/kit'
import { apiGenerateQuiz, type DraftQuestion, type QuizDraftFormat } from '@/lib/api/adminReports'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

const COUNTS = [3, 5, 8, 10] as const

export function AiQuestionsDialog({
  open,
  assessmentId,
  title,
  source,
  onClose,
  onAdd,
}: {
  open: boolean
  assessmentId: string | null
  title: string
  /** What the questions are written from, e.g. "the whole course". */
  source: string
  onClose: () => void
  /** Saves the kept drafts; resolves when they're all saved. */
  onAdd: (drafts: DraftQuestion[]) => Promise<void>
}) {
  const [count, setCount] = useState<number>(5)
  const [format, setFormat] = useState<QuizDraftFormat>('multiple-choice')
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null)
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<'writing' | 'adding' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setDrafts(null)
      setError('')
      setBusy(null)
    }
  }, [open])

  async function write() {
    if (!assessmentId) return
    setBusy('writing')
    setError('')
    try {
      const { questions } = await apiGenerateQuiz({ assessmentId, count, format })
      setDrafts(questions)
      setKeep(new Set(questions.map((_, i) => i)))
    } catch (e) {
      setError(errorMessage(e, 'Questions couldn’t be written right now. Try again in a minute.'))
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    if (!drafts) return
    setBusy('adding')
    setError('')
    try {
      await onAdd(drafts.filter((_, i) => keep.has(i)))
      onClose()
    } catch {
      setError('Some questions didn’t save. Check the list and try again.')
      setBusy(null)
    }
  }

  const toggle = (i: number) =>
    setKeep((k) => {
      const next = new Set(k)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const kept = keep.size
  const footer = drafts ? (
    <>
      <Button variant="ghost" onClick={write} disabled={!!busy} className="me-auto">
        <RefreshCw className={cn('h-4 w-4', busy === 'writing' && 'animate-spin')} aria-hidden />
        Write new ones
      </Button>
      <Button variant="secondary" onClick={onClose} disabled={busy === 'adding'}>
        Cancel
      </Button>
      <Button onClick={add} disabled={!kept || !!busy}>
        {busy === 'adding' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Add {kept} question{kept === 1 ? '' : 's'}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose} disabled={!!busy}>
        Cancel
      </Button>
      <Button onClick={write} disabled={!!busy || !assessmentId}>
        {busy === 'writing' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {busy === 'writing' ? 'Writing…' : 'Write questions'}
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      size="lg"
      title={title}
      description={`Written from ${source}. Nothing is added until you choose.`}
      onClose={busy ? () => {} : onClose}
      footer={footer}
    >
      {!drafts ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ui-text">How many</span>
            <Segmented
              label="How many questions"
              value={String(count)}
              onChange={(v) => setCount(Number(v))}
              options={COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
              className="self-start"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ui-text">Type</span>
            <Segmented<QuizDraftFormat>
              label="Question type"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'multiple-choice', label: 'Multiple choice' },
                { value: 'true-false', label: 'True or false' },
                { value: 'mixed', label: 'A mix' },
              ]}
              className="max-w-full self-start overflow-x-auto"
            />
          </div>
          <p className="text-[13px] leading-relaxed text-ui-muted">
            Each question is checked against the course text, so you may get fewer than you asked for. Review the answers before
            adding them.
          </p>
          {busy === 'writing' && (
            <p role="status" className="flex items-center gap-2 text-sm text-ui-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Reading the course and writing questions. This takes about 10 to 30 seconds.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-ui-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="text-[13px] text-ui-danger">
              {error}
            </p>
          )}
          <ol aria-label="Draft questions" aria-busy={busy === 'writing'} className={cn('flex flex-col gap-3', busy === 'writing' && 'opacity-50')}>
            {drafts.map((d, i) => {
              const on = keep.has(i)
              return (
                <li
                  key={`${i}-${d.question}`}
                  className={cn('rounded-[12px] border px-4 py-3', on ? 'border-ui-brand/40 bg-ui-surface' : 'border-ui-line bg-ui-surface-2')}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(i)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--ui-brand)]"
                      aria-label={`Keep question ${i + 1}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-ui-text">
                        {i + 1}. {d.question}
                      </span>
                      <span className="mt-0.5 block text-xs text-ui-muted">{d.format === 'true-false' ? 'True or false' : 'Multiple choice'}</span>
                    </span>
                  </label>
                  <ul className="mt-2 flex flex-col gap-1 ps-7">
                    {d.options.map((o, j) => {
                      const right = j === d.correctIndex
                      return (
                        <li key={j} className={cn('flex items-start gap-2 text-sm', right ? 'font-semibold text-ui-ok' : 'text-ui-text')}>
                          {right ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
                          ) : (
                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ui-line" aria-hidden />
                          )}
                          <span className="min-w-0 break-words">
                            {o}
                            {right && <span className="sr-only"> (correct answer)</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {d.explanation && <p className="mt-2 break-words ps-7 text-[13px] leading-relaxed text-ui-muted">{d.explanation}</p>}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </Modal>
  )
}
