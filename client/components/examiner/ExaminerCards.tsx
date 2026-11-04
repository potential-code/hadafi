'use client'

/**
 * The cards the AI Examiner puts in the thread: the scene, "marking your
 * exam" and the scorecard (ported from SMEEP's folio inserts and scorecard).
 * The scorecard shows the result Hadafi's server marked, never the examiner's
 * own in-browser scorecard.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { BadgeCheck } from 'lucide-react'
import { ProgressBar } from '@/components/kit'
import { cn } from '@/lib/utils'

export const DIMENSION_LABELS: Record<string, string> = {
  courseKnowledge: 'Course knowledge',
  application: 'Applying it',
  communication: 'Communication',
  problemSolving: 'Problem-solving',
  professionalism: 'Professionalism',
}

export function bandOf(score: number): { label: string; tone: 'good' | 'warn' } {
  if (score >= 80) return { label: 'Excellent', tone: 'good' }
  if (score >= 60) return { label: 'Good', tone: 'good' }
  return { label: 'Keep practising', tone: 'warn' }
}

/** The quiet "keep practising" tone (amber, never red). */
export const WARN_STYLE = { color: 'var(--hana-warn, #87490f)', background: 'var(--hana-warn-bg, #fbefe2)' }

export function ExamCard({
  title,
  kind,
  latest = true,
  children,
  className,
}: {
  title?: ReactNode
  kind?: ReactNode
  latest?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('hx-card mb-4', className)} data-latest={latest ? 'true' : 'false'}>
      {(title || kind) && (
        <div className="px-[18px] pt-4">
          {kind && <p className="hx-kind mb-1">{kind}</p>}
          {title && <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ui-text">{title}</p>}
        </div>
      )}
      {children && <div className="px-[18px] py-3.5 text-[14px] leading-relaxed">{children}</div>}
    </div>
  )
}

export function ExamCardSkeleton() {
  return (
    <div className="hx-card mb-4 animate-pulse space-y-3 p-[18px]" data-latest="false" aria-hidden>
      <div className="h-4 w-2/3 rounded-md bg-ui-surface-2" />
      <div className="h-3 w-full rounded-md bg-ui-surface-2" />
      <div className="h-3 w-4/5 rounded-md bg-ui-surface-2" />
    </div>
  )
}

export interface Scorecard {
  scenario: string
  overallScore: number
  dimensions: Record<string, number>
  strengths: string[]
  improvements: string[]
  feedback: string
}

/**
 * The marked result. A context, not a prop: CopilotKit registers a tool's
 * render closure once, so a prop captured there would keep its first value.
 */
export type ScorecardResult = { result: Scorecard | null; error: string | null }
export const ScorecardResultContext = createContext<ScorecardResult>({ result: null, error: null })

/** What record_assessment renders: marking, then the server's scorecard (or why it couldn't be marked). */
export function MarkedScorecard({ courseTitle }: { courseTitle: string }) {
  const { result, error } = useContext(ScorecardResultContext)
  if (result) return <ScorecardCard card={result} courseTitle={courseTitle} />
  if (error) {
    return (
      <ExamCard title="Exam result" kind={`Scorecard, ${courseTitle}`}>
        <p className="text-[14px] leading-[1.7] text-ui-text" role="alert">{error}</p>
      </ExamCard>
    )
  }
  return <MarkingCard />
}

export function MarkingCard() {
  return (
    <div role="status" aria-label="Marking your exam">
      <ExamCard title="Marking your exam" kind="Hana is scoring your answers against the course" latest={false}>
        <div className="animate-pulse space-y-2.5" aria-hidden>
          <div className="h-3 w-full rounded-md bg-ui-surface-2" />
          <div className="h-3 w-4/5 rounded-md bg-ui-surface-2" />
        </div>
      </ExamCard>
    </div>
  )
}

function ScorecardCard({ card, courseTitle }: { card: Scorecard; courseTitle: string }) {
  const band = bandOf(card.overallScore)
  return (
    <ExamCard title="Exam result" kind={`Scorecard, ${courseTitle}`}>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="text-[40px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">
          {card.overallScore}
          <span className="text-base font-medium text-ui-muted">/100</span>
        </div>
        <span
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-semibold"
          style={band.tone === 'good' ? { color: 'var(--ui-ok)', background: 'var(--ui-ok-soft)' } : WARN_STYLE}
        >
          {band.label}
        </span>
      </div>
      <dl className="mb-4 space-y-2.5">
        {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
          const v = Math.max(0, Math.min(100, card.dimensions?.[key] ?? 0))
          return (
            <div key={key} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_32px] items-center gap-3 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)_32px]">
              <dt className="truncate text-ui-text">{label}</dt>
              <dd className="contents">
                <ProgressBar value={v} label={label} />
                <span className="text-end font-semibold tabular-nums text-ui-text">{v}</span>
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-3">
          <p className="mb-1.5 text-[13px] font-semibold text-ui-ok">What you did well</p>
          <ul className="list-disc space-y-1 ps-4">
            {card.strengths.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ui-text" dir="auto">{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-3">
          <p className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--hana-warn, #87490f)' }}>What to work on</p>
          <ul className="list-disc space-y-1 ps-4">
            {card.improvements.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ui-text" dir="auto">{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[14px] leading-[1.7] text-ui-text" dir="auto">{card.feedback}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-ok" role="status">
        <BadgeCheck className="h-4 w-4" aria-hidden /> Saved to your past attempts
      </p>
    </ExamCard>
  )
}
