'use client'

/**
 * The course itinerary for Multi Learning (ported from SMEEP). On wide
 * screens it docks beside the conversation; on phones and tablets it is a
 * slim progress strip that opens as a sheet. Everything here comes from the
 * course state Hadafi computes, the same truth Hana follows.
 */

import { useEffect, useRef, useState } from 'react'
import { Award, Check, ChevronDown, ClipboardCheck, Lock, X } from 'lucide-react'
import { ProgressBar } from '@/components/kit'
import { cn } from '@/lib/utils'
import type { NextStep, StateUnit, UnitStep } from './api'
import { useTutor } from './context'
import { contentDir, type TutorStrings } from './strings'

function stepName(step: UnitStep, ui: TutorStrings): string {
  switch (step.kind) {
    case 'intro':
      return ui.introductionKind
    case 'video':
      return ui.videoKind
    case 'reading':
      return ui.readingKind
    case 'action-plan':
      return ui.actionPlanKind
    case 'check-in':
      return ui.checkInKind
  }
}

function isNow(step: UnitStep, n: NextStep | null): boolean {
  if (!n) return false
  switch (step.kind) {
    case 'intro':
      return n.action === 'show_unit_intro' && n.unitId === step.unitId
    case 'video':
      return n.action === 'show_video' && n.learningBlockId === step.blockId
    case 'reading':
      return n.action === 'show_summary' && n.unitId === step.unitId
    case 'action-plan':
    case 'check-in':
      return n.action === 'show_action_plan' && n.learningBlockId === step.blockId
  }
}

function nowUnitId(n: NextStep | null, units: StateUnit[]): string | null {
  if (!n) return null
  if (n.action === 'show_unit_intro' || n.action === 'show_summary') return n.unitId
  if (n.action === 'show_video' || n.action === 'show_action_plan') {
    if (n.unitId) return n.unitId
    for (const unit of units) {
      if (unit.steps.some((s) => s.kind !== 'intro' && s.kind !== 'reading' && s.blockId === n.learningBlockId)) return unit.unitId
    }
  }
  return null
}

function Unit({ unit, current }: { unit: StateUnit; current: boolean }) {
  const { ui, now } = useTutor()
  const [open, setOpen] = useState(false)
  const nowStep = current ? unit.steps.find((step) => isNow(step, now)) : undefined

  return (
    <li>
      <button
        type="button"
        className={cn(
          'grid w-full grid-cols-[22px_minmax(0,1fr)_16px] items-start gap-2.5 rounded-lg p-2 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand',
          current ? 'bg-ui-brand-soft' : 'hover:bg-ui-surface-2',
        )}
        aria-expanded={open}
        aria-current={current ? 'step' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={cn(
            'grid h-[22px] w-[22px] place-items-center rounded-full text-[11px]',
            unit.complete
              ? 'bg-ui-ok-soft text-ui-ok'
              : current
                ? 'bg-ui-brand font-bold text-white'
                : 'border-[1.5px] border-ui-line font-semibold text-ui-muted',
          )}
        >
          {unit.complete ? <Check className="h-3 w-3" strokeWidth={2.5} aria-label={ui.done} /> : unit.order}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            dir={contentDir(unit.name)}
            className={cn('text-start text-[13px] leading-[1.4] [overflow-wrap:anywhere]', current ? 'font-semibold text-ui-text' : 'text-ui-text')}
          >
            {unit.name}
          </span>
          {nowStep && <span className="text-xs font-semibold text-ui-brand-text">{ui.nowStep(stepName(nowStep, ui))}</span>}
        </span>
        <ChevronDown className={cn('mt-0.5 h-4 w-4 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="mb-1 ms-[42px] mt-0.5 space-y-1.5 pb-1">
          {unit.steps.map((step, i) => {
            const stepNow = isNow(step, now)
            return (
              <li key={i} className="flex items-center gap-2 text-xs text-ui-muted">
                {step.done ? (
                  <Check className="h-3.5 w-3.5 flex-none text-ui-ok" aria-hidden />
                ) : (
                  <span className={cn('mx-1 block h-1.5 w-1.5 flex-none rounded-full', stepNow ? 'bg-ui-brand' : 'bg-ui-line')} aria-hidden />
                )}
                <span className={cn(stepNow && 'font-semibold text-ui-brand-text')}>
                  {stepNow ? ui.nowStep(stepName(step, ui)) : stepName(step, ui)}
                </span>
                {step.done && <span className="sr-only">{ui.done}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function Milestone({
  now,
  done,
  icon,
  title,
  hint,
}: {
  now: boolean
  done: boolean
  icon: 'pre' | 'final'
  title: string
  hint: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 rounded-[10px] border border-dashed px-2 py-2.5',
        now ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line',
      )}
      aria-current={now ? 'step' : undefined}
    >
      <span
        className={cn(
          'grid h-[22px] w-[22px] place-items-center rounded-full',
          done ? 'bg-ui-ok-soft text-ui-ok' : now ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-muted',
        )}
      >
        {done ? (
          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        ) : icon === 'pre' ? (
          <ClipboardCheck className="h-3 w-3" aria-hidden />
        ) : now ? (
          <Award className="h-3 w-3" aria-hidden />
        ) : (
          <Lock className="h-3 w-3" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-ui-text">{title}</span>
        <span className="text-xs text-ui-muted">{hint}</span>
      </span>
    </div>
  )
}

function Itinerary() {
  const { ui, state, now } = useTutor()
  const active = state?.active
  if (!active) return null
  const done = active.units.filter((u) => u.complete).length
  const pct = Math.max(0, Math.min(100, Math.round(active.progress)))
  const quiz = active.finalQuiz
  const pre = active.preTest
  const currentUnit = nowUnitId(now, active.units) ?? active.currentUnitId
  const preNow = now?.action === 'show_quiz' && now.assessmentId === pre?.assessmentId
  const quizNow = now?.action === 'show_quiz' && !preNow

  return (
    <div className="flex flex-col gap-3.5 px-4 py-5">
      <div className="flex flex-col gap-2">
        <p dir={contentDir(active.name)} className="text-start text-[15px] font-semibold leading-snug text-ui-text [overflow-wrap:anywhere]">
          {active.name}
        </p>
        <div className="flex items-center gap-2.5">
          <ProgressBar value={pct} className="flex-1" label={ui.showProgress} />
          <span className="text-[13px] font-semibold tabular-nums text-ui-text">{pct}%</span>
        </div>
        <p className="text-xs text-ui-muted">{active.complete ? ui.courseComplete : ui.unitsComplete(done, active.units.length)}</p>
      </div>
      {pre && <Milestone now={preNow} done={pre.done} icon="pre" title={ui.preTestKind} hint={pre.done ? ui.done : ui.preTestHint} />}
      <ol className="flex flex-col gap-0.5">
        {active.units.map((u) => (
          <Unit key={u.unitId} unit={u} current={!u.complete && u.unitId === currentUnit} />
        ))}
      </ol>
      {quiz && (
        <Milestone
          now={quizNow}
          done={quiz.passed}
          icon="final"
          title={ui.finalExamKind}
          hint={
            quiz.passed
              ? `${ui.passedTitle}${quiz.bestScore !== null ? `, ${ui.bestScore(quiz.bestScore)}` : ''}`
              : quiz.locked
                ? ui.noAttemptsLeft
                : quiz.bestScore !== null
                  ? `${ui.passMark(quiz.passingScore)}, ${ui.bestScore(quiz.bestScore)}`
                  : ui.earnsCertificate
          }
        />
      )}
    </div>
  )
}

/** Wide screens: docked beside the conversation. */
export function CourseRail() {
  const { ui, state } = useTutor()
  if (!state?.active) return null
  return (
    <aside className="hidden w-[300px] flex-none overflow-y-auto border-s border-ui-line bg-ui-surface lg:block" aria-label={ui.showProgress}>
      <Itinerary />
    </aside>
  )
}

/** Phones and tablets: a progress strip that opens the itinerary as a sheet. */
export function CourseStrip() {
  const { ui, state } = useTutor()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const active = state?.active
  if (!active) return null
  const done = active.units.filter((u) => u.complete).length
  const pct = Math.max(0, Math.min(100, Math.round(active.progress)))

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="relative z-[2] flex w-full items-center gap-3 border-b border-ui-line bg-ui-surface px-4 py-2.5 text-start"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="min-w-0 flex-1">
          <span dir={contentDir(active.name)} className="block truncate text-start text-[13px] font-semibold text-ui-text">
            {active.name}
          </span>
          <ProgressBar value={pct} className="mt-1.5" label={ui.showProgress} />
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-ui-muted">
          <span className="sr-only">{ui.showProgress}: </span>
          {done}/{active.units.length}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ui-muted" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-[14px] bg-ui-surface"
            role="dialog"
            aria-modal="true"
            aria-label={ui.showProgress}
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                ref={closeRef}
                type="button"
                className="grid h-9 w-9 place-items-center rounded-[10px] border border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2"
                onClick={() => setOpen(false)}
                aria-label={ui.close}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <Itinerary />
          </div>
        </>
      )}
    </div>
  )
}
