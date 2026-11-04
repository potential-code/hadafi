'use client'

/**
 * The cards Hana opens in the Multi Learning conversation (ported from SMEEP's
 * tutor cards, ec12753 / a906242). Intro, video, step and exam cards receive
 * only an ID from Hana and load Hadafi's own content; the summary is the one
 * card she writes. Every completion is recorded by the server, which checks
 * it (multiLearning.service); the card only asks.
 *
 * Each card's next action is the only accent element on screen. Once its step
 * is done, the action gives way to a quiet "done" mark, so an old card can
 * never push the learner backwards.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Loader2, RotateCcw } from 'lucide-react'
import { ProgressBar, Skeleton, btn, inputClass } from '@/components/kit'
import { YouTubePlayer } from '@/components/lms/YouTubePlayer'
import { cn } from '@/lib/utils'
import { apiErrorMessage, type QuestionStep, type Quiz, type QuizResult, type StepAnswer, type UnitIntro, type VideoLesson } from './api'
import { useTutor } from './context'

/** Marks the message a card's Continue button sends: the graph must open a card on that turn. */
export const NEXT_MARKER = '[next] '
/** Marks the hidden message that carries a marked exam result. */
export const QUIZ_RESULT_MARKER = '[quiz-result] '
/** Marks the hidden message that carries the learner's saved plan or check-in. */
export const ACTION_PLAN_MARKER = '[action-plan] '

// ── Shared ─────────────────────────────────────────────────────────────────

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    load()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e ?? true))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error }
}

/** One card in the conversation, lined up with Hana's text. */
export function TutorCard({
  title,
  kind,
  latest,
  footer,
  children,
}: {
  title?: string
  kind?: string
  latest: boolean
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="hana-lead mb-4" style={{ animation: 'hana-fadeup 0.24s ease both' }}>
      <section
        className={cn(
          'min-w-0 overflow-hidden rounded-[14px] border bg-ui-surface',
          latest ? 'border-ui-brand/40 shadow-ui' : 'border-ui-line',
        )}
      >
        {(title || kind) && (
          <header className="border-b border-ui-line px-4 pb-3 pt-3.5 sm:px-5">
            {kind && <p className="text-xs font-semibold text-ui-muted">{kind}</p>}
            {title && <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-ui-text [overflow-wrap:anywhere]">{title}</h3>}
          </header>
        )}
        <div className="px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-line bg-ui-surface-2/50 px-4 py-3 sm:px-5">
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="hana-lead mb-4" aria-busy="true">
      <div className="rounded-[14px] border border-ui-line bg-ui-surface p-4 sm:p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-5 w-2/3" />
        <Skeleton className="mt-4 h-20 w-full" />
      </div>
    </div>
  )
}

function NextAction({ children, onClick, busy, gated }: { children: ReactNode; onClick: () => void; busy?: boolean; gated?: boolean }) {
  const { running } = useTutor()
  return (
    <button type="button" className="hana-next" disabled={busy || gated || running} onClick={onClick}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

function Failed({ error }: { error?: unknown }) {
  const { ui, send } = useTutor()
  return (
    <TutorCard latest={false}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ui-text">{apiErrorMessage(error, ui.couldNotLoad)}</p>
        <button
          type="button"
          className={btn({ variant: 'secondary', size: 'sm' })}
          onClick={() => void send(NEXT_MARKER + 'Continue.', { hidden: true })}
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> {ui.tryAgain}
        </button>
      </div>
    </TutorCard>
  )
}

/**
 * An introduction or a summary is done once the learner has it in front of
 * them. Recording it on display (not only on Continue) keeps the course state
 * true when the learner types "continue" instead.
 */
function useRecordWhenShown(blockIds: string[] | null, active: boolean, onRecorded?: () => void) {
  const { api, refresh } = useTutor()
  const done = useRef(false)
  const key = blockIds?.join(',') ?? ''
  useEffect(() => {
    if (!active || !blockIds || done.current) return
    done.current = true
    void (async () => {
      try {
        if (blockIds.length) await api.complete(blockIds)
        onRecorded?.()
        await refresh()
      } catch {
        done.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])
}

/** Tell Hana what this card shows while it is the one in hand. */
function useScreen(description: string | null) {
  const { setOnScreen } = useTutor()
  useEffect(() => {
    if (description) setOnScreen(description)
  }, [description, setOnScreen])
}

function DoneMark() {
  const { ui } = useTutor()
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-muted">
      <CircleCheck className="h-4 w-4 text-ui-ok" aria-hidden /> {ui.done}
    </span>
  )
}

const Forward = () => <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
const Backward = () => <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />

function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-[1.7] text-ui-text [overflow-wrap:anywhere] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[14px] [&_h3]:font-semibold [&_h4]:text-[14px] [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:ps-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

function KeyList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((o, i) => (
        <li key={i} className="flex items-start gap-2 text-[14px] text-ui-text">
          <Check className="mt-0.5 h-4 w-4 flex-none text-ui-ok" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
        </li>
      ))}
    </ul>
  )
}

/** One choice of a multiple-choice question: a radio in a radiogroup. */
function Choice({
  index,
  selected,
  disabled,
  onSelect,
  children,
}: {
  index: number
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-[10px] border px-3 py-2.5 text-start text-[14px] leading-snug transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-ui-brand bg-ui-brand-soft text-ui-text' : 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2',
      )}
    >
      <span
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
          selected ? 'bg-ui-brand text-white' : 'border border-ui-line text-ui-muted',
        )}
        aria-hidden
      >
        {String.fromCharCode(65 + index)}
      </span>
      <span className="min-w-0 pt-1 [overflow-wrap:anywhere]">{children}</span>
    </button>
  )
}

// ── Course list ────────────────────────────────────────────────────────────

export function CoursesCard({ latest }: { latest: boolean }) {
  const { ui, state, openCourse, running } = useTutor()
  const [opening, setOpening] = useState<string | null>(null)
  const list = state?.courses ?? []
  useScreen(latest ? "The list of the learner's enrolled courses is open; they pick one with its button." : null)

  return (
    <TutorCard title={ui.yourCourses} kind={ui.pickOne} latest={latest}>
      {list.length === 0 && <p className="text-sm text-ui-text">{ui.noCourses}</p>}
      <div className="space-y-2">
        {list.map((c) => (
          <button
            key={c.courseId}
            type="button"
            disabled={running || opening !== null}
            onClick={async () => {
              setOpening(c.courseId)
              try {
                await openCourse(c.courseId, c.name)
              } finally {
                setOpening(null)
              }
            }}
            className="w-full rounded-[10px] border border-ui-line bg-ui-surface px-4 py-3 text-start transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand disabled:opacity-70"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-[14px] font-semibold text-ui-text [overflow-wrap:anywhere]">{c.name}</span>
              <span className="inline-flex flex-none items-center gap-1.5 text-[13px] font-semibold text-ui-brand-text">
                {opening === c.courseId ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : c.complete ? (
                  ui.review
                ) : c.progress > 0 ? (
                  ui.resume
                ) : (
                  ui.start
                )}
              </span>
            </span>
            <span className="mt-2 flex items-center gap-2.5">
              <ProgressBar value={c.progress} className="flex-1" label={`${c.name} progress`} />
              <span className="flex-none text-xs font-medium tabular-nums text-ui-muted">
                {c.complete ? ui.complete : c.progress > 0 ? `${c.progress}%` : ui.notStarted}
              </span>
            </span>
          </button>
        ))}
      </div>
    </TutorCard>
  )
}

// ── Unit intro ─────────────────────────────────────────────────────────────

export function UnitIntroCard({ unitId, latest }: { unitId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send, markIntroSeen } = useTutor()
  const { data, error } = useLoad<UnitIntro>(() => api.unitIntro(unitId), [unitId])
  const [busy, setBusy] = useState(false)
  useScreen(latest && data ? `The introduction to the unit "${data.title}" is open.` : null)
  const placed = stepFor('intro', unitId)
  const introBlocks = placed?.step.kind === 'intro' && !placed.step.done ? placed.step.blockIds : null
  useRecordWhenShown(introBlocks, latest && Boolean(data), () => markIntroSeen(unitId))

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      const blockIds = placed?.step.kind === 'intro' && !placed.step.done ? placed.step.blockIds : []
      if (blockIds.length) await api.complete(blockIds)
      else markIntroSeen(unitId)
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } catch {
      /* the state refresh shows what was recorded; Continue can be pressed again */
    } finally {
      setBusy(false)
    }
  }, [api, markIntroSeen, placed, refresh, send, unitId])

  if (error) return <Failed error={error} />
  if (!data) return <CardSkeleton />

  return (
    <TutorCard
      title={data.title}
      kind={placed ? `${ui.introductionKind} · ${ui.unitN(placed.unitOrder)}` : ui.introductionKind}
      latest={latest}
      footer={
        <>
          <span />
          {latest ? (
            <NextAction busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {data.introduction ? (
        <Markdown>{data.introduction}</Markdown>
      ) : data.description ? (
        <Markdown>{data.description}</Markdown>
      ) : (
        <p className="text-sm text-ui-text">{ui.letsBegin}</p>
      )}
      {data.outcomes.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-[13px] font-semibold text-ui-muted">{ui.whatYoullLearn}</p>
          <KeyList items={data.outcomes} />
        </>
      )}
    </TutorCard>
  )
}

// ── Video ──────────────────────────────────────────────────────────────────

const isYouTube = (url: string) => /youtube\.com|youtu\.be|youtube-nocookie\.com/.test(url)

export function VideoCard({ learningBlockId, latest }: { learningBlockId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send } = useTutor()
  const { data, error } = useLoad<VideoLesson>(() => api.video(learningBlockId), [learningBlockId])
  const [watched, setWatched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const transcriptId = useId()
  const placed = stepFor('video', learningBlockId)
  const recorded = placed?.step.done ?? false
  const seen = watched || recorded
  useScreen(
    latest && data
      ? `The video "${data.title}" is open${seen ? ' and has been watched' : '; the learner has not finished watching it'}.`
      : null,
  )

  // Watching it through (as the course page counts it) records the step.
  const reached = useRef(false)
  const onWatched = useCallback(async () => {
    if (reached.current) return
    reached.current = true
    setWatched(true)
    try {
      await api.complete([learningBlockId])
      await refresh()
    } catch {
      /* Continue retries the save */
    }
  }, [api, learningBlockId, refresh])

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      if (!recorded) await api.complete([learningBlockId])
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } catch {
      /* stays on this card */
    } finally {
      setBusy(false)
    }
  }, [api, learningBlockId, recorded, refresh, send])

  if (error) return <Failed error={error} />
  if (!data) return <CardSkeleton />

  return (
    <TutorCard
      title={placed?.unitName ?? data.title}
      kind={[ui.videoKind, placed ? ui.unitN(placed.unitOrder) : ''].filter(Boolean).join(' · ')}
      latest={latest}
      footer={
        <>
          <span className={seen ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-ok' : 'text-[13px] text-ui-muted'}>
            {seen && <Check className="h-4 w-4" aria-hidden />}
            {seen ? ui.watched : ui.watchToContinue}
          </span>
          {latest ? (
            <NextAction gated={!seen} busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {isYouTube(data.videoUrl) ? (
        <YouTubePlayer videoUrl={data.videoUrl} onProgress={(pct) => pct >= 95 && void onWatched()} />
      ) : (
        <div className="relative aspect-video overflow-hidden rounded-[10px] bg-black">
          <video
            src={data.videoUrl}
            controls
            playsInline
            className="h-full w-full"
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration && v.currentTime / v.duration >= 0.95) void onWatched()
            }}
          />
        </div>
      )}
      {data.transcript && (
        <div className="mt-3">
          <button
            type="button"
            className={cn(btn({ variant: 'ghost', size: 'sm' }), '-ms-2')}
            aria-expanded={showTranscript}
            aria-controls={transcriptId}
            onClick={() => setShowTranscript((s) => !s)}
          >
            {ui.transcript}
            <ChevronDown className={cn('h-4 w-4 transition-transform', showTranscript && 'rotate-180')} aria-hidden />
          </button>
          {showTranscript && (
            <div id={transcriptId} className="mt-2 max-h-64 overflow-y-auto rounded-[10px] bg-ui-surface-2 p-3">
              <Markdown>{data.transcript}</Markdown>
            </div>
          )}
        </div>
      )}
    </TutorCard>
  )
}

// ── Summary ────────────────────────────────────────────────────────────────

export function SummaryCard({
  unitId,
  title,
  content,
  keyPoints,
  latest,
}: {
  unitId: string
  title?: string
  content?: string
  keyPoints?: string[]
  latest: boolean
}) {
  const { ui, api, stepFor, refresh, send } = useTutor()
  const [busy, setBusy] = useState(false)
  const placed = stepFor('reading', unitId)
  const readingBlocks = placed?.step.kind === 'reading' && !placed.step.done ? placed.step.blockIds : null
  useRecordWhenShown(readingBlocks, latest && Boolean(content))
  useScreen(latest && title ? `Hana's summary of the unit ("${title}") is open.` : null)

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      if (placed?.step.kind === 'reading' && !placed.step.done) await api.complete(placed.step.blockIds)
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } catch {
      /* stays on this card */
    } finally {
      setBusy(false)
    }
  }, [api, placed, refresh, send])

  return (
    <TutorCard
      title={title ?? ''}
      kind={placed ? `${ui.readingKind} · ${ui.unitN(placed.unitOrder)}` : ui.readingKind}
      latest={latest}
      footer={
        <>
          <span />
          {latest ? (
            <NextAction gated={!content} busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {content && <Markdown>{content}</Markdown>}
      {keyPoints && keyPoints.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-[13px] font-semibold text-ui-muted">{ui.keyPoints}</p>
          <KeyList items={keyPoints} />
        </>
      )}
    </TutorCard>
  )
}

// ── Action plan and unit check-in ──────────────────────────────────────────

type Draft = { text?: string; selected?: number }

export function QuestionStepCard({ learningBlockId, latest }: { learningBlockId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send, running } = useTutor()
  const { data, error } = useLoad<QuestionStep>(() => api.step(learningBlockId), [learningBlockId])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const formId = useId()
  const checkIn = data?.kind === 'check-in'
  const placed = stepFor(checkIn ? 'check-in' : 'action-plan', learningBlockId)
  const saved = (placed?.step.done ?? data?.done ?? false) || justSaved

  // A revisit shows what the learner saved before.
  useEffect(() => {
    if (!data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const q of data.questions) {
        if (next[q.questionId] !== undefined || !q.answer) continue
        next[q.questionId] = 'text' in q.answer ? { text: q.answer.text } : { selected: q.answer.selected }
      }
      return next
    })
  }, [data])

  useScreen(
    latest && data
      ? saved
        ? `The ${checkIn ? 'check-in' : 'action plan'} for "${data.title}" has been saved.`
        : checkIn
          ? `The unit check-in for "${data.title}" is open: ${data.questions.map((q) => `"${q.prompt}"`).join('; ')}. Reflection questions with no wrong answers; never answer for the learner.`
          : `The action plan for "${data.title}" is open. Prompts: ${data.questions.map((q) => `"${q.prompt}"`).join('; ')}. The learner writes their own plan; help with ideas if asked, never write it for them.`
      : null,
  )

  const answered = (q: QuestionStep['questions'][number]) => {
    const d = drafts[q.questionId]
    return q.format === 'short-text' ? (d?.text ?? '').trim().length > 0 : typeof d?.selected === 'number'
  }

  const submit = useCallback(async () => {
    if (!data) return
    setBusy(true)
    setFailed(null)
    try {
      const answers: StepAnswer[] = data.questions.map((q) =>
        q.format === 'short-text'
          ? { questionId: q.questionId, text: (drafts[q.questionId]?.text ?? '').trim() }
          : { questionId: q.questionId, selected: drafts[q.questionId]?.selected ?? -1 },
      )
      await api.submitStep(learningBlockId, answers)
      setJustSaved(true)
      await refresh()
      const quoted = data.questions
        .map((q) => {
          const d = drafts[q.questionId]
          const said = q.format === 'short-text' ? (d?.text ?? '').trim().slice(0, 400) : (q.options[d?.selected ?? -1] ?? '')
          return `${q.prompt} — "${said}"`
        })
        .join('\n')
      await send(`${ACTION_PLAN_MARKER}${checkIn ? 'I answered the unit check-in' : 'I wrote my action plan'}:\n${quoted}`, { hidden: true })
    } catch (e) {
      setFailed(apiErrorMessage(e, ui.couldNotLoad))
    } finally {
      setBusy(false)
    }
  }, [api, checkIn, data, drafts, learningBlockId, refresh, send, ui])

  if (error) return <Failed error={error} />
  if (!data) return <CardSkeleton />

  const allAnswered = data.questions.every(answered)
  const kindLabel = checkIn ? ui.checkInKind : ui.actionPlanKind

  return (
    <TutorCard
      title={data.title}
      kind={placed ? `${kindLabel} · ${ui.unitN(placed.unitOrder)}` : kindLabel}
      latest={latest}
      footer={
        <>
          <span className={saved ? 'text-[13px] font-medium text-ui-ok' : 'min-w-0 text-[13px] text-ui-muted'}>
            {saved ? ui.saved : checkIn ? ui.checkInHint : ui.actionPlanHint}
          </span>
          {saved ? (
            <DoneMark />
          ) : (
            <NextAction gated={!allAnswered} busy={busy} onClick={submit}>
              {busy ? ui.saving : checkIn ? ui.saveAnswers : ui.savePlan} <Forward />
            </NextAction>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {data.questions.map((q) => {
          const id = `${formId}-${q.questionId}`
          const d = drafts[q.questionId]
          if (q.format === 'short-text') {
            return (
              <div key={q.questionId}>
                <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ui-text [overflow-wrap:anywhere]">
                  {q.prompt}
                </label>
                {saved ? (
                  <p id={id} className="whitespace-pre-wrap rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ui-text [overflow-wrap:anywhere]">
                    {d?.text ?? ''}
                  </p>
                ) : (
                  <textarea
                    id={id}
                    rows={3}
                    value={d?.text ?? ''}
                    maxLength={10_000}
                    placeholder={q.placeholder ?? (checkIn ? ui.answerPlaceholder : ui.planPlaceholder)}
                    disabled={busy || running}
                    onChange={(e) => setDrafts((all) => ({ ...all, [q.questionId]: { text: e.target.value } }))}
                    className={cn(inputClass, 'h-auto min-h-[84px] resize-y py-2.5 leading-relaxed')}
                  />
                )}
              </div>
            )
          }
          return (
            <fieldset key={q.questionId}>
              <legend className="mb-2 text-[14px] font-semibold text-ui-text [overflow-wrap:anywhere]">{q.prompt}</legend>
              <div role="radiogroup" aria-label={q.prompt} className="space-y-2">
                {q.options.map((option, i) => (
                  <Choice
                    key={i}
                    index={i}
                    selected={d?.selected === i}
                    disabled={saved || busy || running}
                    onSelect={() => setDrafts((all) => ({ ...all, [q.questionId]: { selected: i } }))}
                  >
                    {option}
                  </Choice>
                ))}
              </div>
            </fieldset>
          )
        })}
      </div>
      {failed && (
        <p className="mt-2.5 text-[13px] font-medium text-ui-danger" role="alert">
          {failed}
        </p>
      )}
    </TutorCard>
  )
}

// ── Pre-test and final exam ────────────────────────────────────────────────

function ResultBand({ good, score, children }: { good: boolean; score: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-4 rounded-[12px] p-4', good ? 'bg-ui-ok-soft' : 'bg-ui-surface-2')}>
      <span className={cn('text-2xl font-semibold tabular-nums', good ? 'text-ui-ok' : 'text-ui-text')}>{score}</span>
      <span className="min-w-0 text-[14px] leading-snug text-ui-text">{children}</span>
    </div>
  )
}

export function TutorQuizCard({ assessmentId, latest }: { assessmentId: string; latest: boolean }) {
  const { ui, api, refresh, send, running } = useTutor()
  const { data, error } = useLoad<Quiz>(() => api.quiz(assessmentId), [assessmentId])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const shown = data?.questions[index]
  const pre = data?.kind === 'pre'
  const what = pre ? 'pre-test' : 'final exam'
  useScreen(
    latest && data
      ? result
        ? `The ${what} "${data.title}" has been submitted: ${result.correctCount} of ${result.gradedCount} correct (${result.score}%)${result.isGraded ? `, ${result.passed ? 'passed' : 'not passed'}` : ''}.`
        : shown
          ? `The ${what} "${data.title}" is the learner's current step, at question ${index + 1} of ${data.questions.length}: "${shown.text}" Options: ${shown.options
              .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
              .join('; ')}. The learner has not submitted yet. Never say or hint which option is correct.`
          : null
      : null,
  )

  const submit = useCallback(async () => {
    if (!data) return
    setBusy(true)
    setFailed(null)
    try {
      const r = await api.submitQuiz(
        assessmentId,
        data.questions.map((q) => ({ questionId: q.questionId, selectedIndex: answers[q.questionId] ?? -1 })),
      )
      setResult(r)
      await refresh()
      const left = r.maxAttempts > 0 ? Math.max(0, r.maxAttempts - r.attemptsUsed) : -1
      const name = r.kind === 'pre' ? 'pre-test' : 'final exam'
      await send(
        QUIZ_RESULT_MARKER +
          (!r.isGraded
            ? `Hadafi recorded my ${name}: ${r.correctCount} of ${r.gradedCount} correct, ${r.score}%. It has no pass mark.`
            : `Hadafi marked my ${name}: ${r.correctCount} of ${r.gradedCount} correct, ${r.score}% (pass mark ${r.passingScore}%), ${r.passed ? 'PASSED' : 'NOT passed'}.${!r.passed && left >= 0 ? ` ${left} attempts left.` : ''}`),
        { hidden: true },
      )
    } catch (e) {
      setFailed(apiErrorMessage(e, ui.couldNotLoad))
    } finally {
      setBusy(false)
    }
  }, [answers, api, assessmentId, data, refresh, send, ui])

  if (error) return <Failed error={error} />
  if (!data) return <CardSkeleton />

  // An older, unanswered copy of a quiz opened again further down disappears:
  // the copy below is the quiz. A submitted copy keeps its result.
  const locked = data.maxAttempts > 0 && data.attemptsUsed >= data.maxAttempts && !data.passed
  if (!latest && !result && !data.passed && !locked) return null

  const kind = pre ? ui.preTestKind : ui.finalExamKind

  if (result) {
    const left = result.maxAttempts > 0 ? Math.max(0, result.maxAttempts - result.attemptsUsed) : -1
    return (
      <TutorCard title={data.title} kind={kind} latest={latest}>
        <ResultBand good={result.passed} score={`${result.score}%`}>
          <b>{!result.isGraded ? (pre ? ui.startingPoint : ui.takenTitle) : result.passed ? ui.passedTitle : ui.notPassedTitle}</b>
          <br />
          {ui.correctOf(result.correctCount, result.gradedCount)}
          {result.isGraded && ` · ${ui.passMark(result.passingScore)}`}
          {pre && result.passed && ` · ${ui.lessonsOpen}`}
          {!result.passed && left >= 0 && ` · ${left > 0 ? ui.attemptsLeft(left) : ui.noAttemptsLeft}`}
        </ResultBand>
      </TutorCard>
    )
  }

  if (data.passed || locked) {
    return (
      <TutorCard title={data.title} kind={kind} latest={latest}>
        <p className="text-sm text-ui-text">{data.passed ? ui.alreadyPassed : ui.noAttemptsLeft}</p>
      </TutorCard>
    )
  }

  const q = data.questions[index]
  const total = data.questions.length
  const last = index === total - 1
  const answered = q ? answers[q.questionId] !== undefined : false
  const allAnswered = data.questions.every((x) => answers[x.questionId] !== undefined)

  return (
    <TutorCard title={data.title} kind={kind} latest={latest}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-ui-muted">
        <span>{ui.questionOf(index + 1, total)}</span>
        {data.maxAttempts > 0 && <span>{ui.attemptsLeft(Math.max(0, data.maxAttempts - data.attemptsUsed))}</span>}
      </div>
      <ProgressBar value={((index + 1) / total) * 100} className="mb-4 h-1" label={ui.questionOf(index + 1, total)} />
      <p id={`q-${assessmentId}`} className="mb-3 text-[15px] font-semibold text-ui-text [overflow-wrap:anywhere]">
        {q?.text}
      </p>
      <div role="radiogroup" aria-labelledby={`q-${assessmentId}`} className="space-y-2">
        {q?.options.map((option, i) => (
          <Choice
            key={i}
            index={i}
            selected={answers[q.questionId] === i}
            disabled={busy}
            onSelect={() => setAnswers((a) => ({ ...a, [q.questionId]: i }))}
          >
            {option}
          </Choice>
        ))}
      </div>
      {failed && (
        <p className="mt-2.5 text-[13px] font-medium text-ui-danger" role="alert">
          {failed}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className={btn({ variant: 'secondary', size: 'sm' })}
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          <Backward /> {ui.previous}
        </button>
        {last ? (
          <button type="button" className="hana-next" disabled={!allAnswered || busy || running} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? ui.submitting : ui.submit}
          </button>
        ) : (
          <button
            type="button"
            className={btn({ variant: 'secondary', size: 'sm' })}
            disabled={!answered}
            onClick={() => setIndex((i) => i + 1)}
          >
            {ui.next} <Forward />
          </button>
        )}
      </div>
    </TutorCard>
  )
}
