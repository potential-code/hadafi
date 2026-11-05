'use client'

/**
 * AI Insights: the chat frame. Lazily imported by the view, which fetches the
 * catalogue and handles its loading and error states, so by the time this
 * mounts the catalogue is in hand. The agent wiring (catalogue context, the
 * three tools and their cards) lives in `insights-agent.tsx`.
 */
import { useCallback } from 'react'
import { ArrowUpRight, BarChart3, Database, FileText, SquarePen } from 'lucide-react'
import { btn } from '@/components/kit'
import { AdminCopilotSession } from '@/components/admin/ai-shared/AdminCopilot'
import { AdminChat, useConversation, type WelcomeScreenProps } from '@/components/admin/ai-shared/AdminChat'
import '@/components/admin/ai-shared/admin-ai.css'
import { HanaPortrait } from '@/components/dashboard/HanaMessages'
import { getUser } from '@/lib/auth'
import type { SqlCatalog } from '@/lib/api/adminAi'
import { cn } from '@/lib/utils'
import { INSIGHTS_AGENT_ID, InsightsAgent, STARTERS } from './insights-agent'
import { resetFigures, useReadyFigureCount } from './figure-store'
import { useNarrow } from '@/components/dashboard/useNarrow'

const STARTER_ICON = { data: Database, chart: BarChart3, report: FileText } as const

function greeting(): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = getUser()?.fullName?.split(/\s+/)[0]
  return first ? `${part}, ${first}` : part
}

/**
 * The first screen, and the answer to "what can this do?": a greeting, what
 * Hana reads from, and one starter per ability.
 */
function InsightsWelcome({ input, className }: WelcomeScreenProps) {
  const { send, running } = useConversation(INSIGHTS_AGENT_ID)

  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-9">
        <div className="mx-auto w-full" style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}>
          <div className="ai-welcome flex items-start gap-3">
            <HanaPortrait size={44} />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight text-ui-text [text-wrap:balance]">{greeting()}.</h2>
              <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ui-muted">
                I&rsquo;m Hana. Ask me about Hadafi&rsquo;s learners, courses, mentoring and events. I answer with numbered
                charts you can put in a report, and every figure shows the query behind it.
              </p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-ui-text">
                <span className="inline-flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-ui-brand-text" aria-hidden /> Live Hadafi data
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-ui-brand-text" aria-hidden /> Numbered figures
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-ui-brand-text" aria-hidden /> PDF &amp; Excel reports
                </span>
              </p>
            </div>
          </div>

          <ul className="mt-6 divide-y divide-ui-line overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
            {STARTERS.map((starter, i) => {
              const Icon = STARTER_ICON[starter.kind]
              return (
                <li key={starter.text} className="ai-starter" style={{ animationDelay: `${80 + i * 45}ms` }}>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => void send(starter.text)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ui-text transition-colors hover:bg-ui-surface-2 focus-visible:bg-ui-surface-2 focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ui-brand-soft text-ui-brand-text">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">{starter.text}</span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-ui-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="shrink-0">{input}</div>
    </div>
  )
}

function freshness(catalog: SqlCatalog): string {
  if (!catalog.refreshedAt) return 'Answers from Hadafi’s live reporting views'
  const d = new Date(catalog.refreshedAt)
  if (Number.isNaN(d.getTime())) return 'Answers from Hadafi’s live reporting views'
  return `Data as of ${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

/**
 * The header: who this is, and once a conversation exists, how many figures it
 * holds and the two things to do with it. "Create report" asks Hana in words,
 * so the report is written from this conversation rather than templated.
 */
function InsightsHeader({ catalog }: { catalog: SqlCatalog }) {
  const { send, reset, running, hasMessages } = useConversation(INSIGHTS_AGENT_ID)
  const figures = useReadyFigureCount()

  const createReport = useCallback(() => {
    void send('Put the figures from this conversation into a report, with a short summary of what they show.')
  }, [send])

  return (
    <header className="relative z-[3] flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6">
      <HanaPortrait size={36} />
      <div className="flex min-w-0 flex-1 basis-[220px] flex-col">
        <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">AI Insights</h1>
        <p className="truncate text-[13px] leading-snug text-ui-muted">{freshness(catalog)}</p>
      </div>
      {hasMessages && (
        <div className="flex items-center gap-2">
          <span className="hidden text-[13px] text-ui-muted sm:inline">
            {figures === 0 ? 'No figures yet' : `${figures} figure${figures === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            disabled={running || figures === 0}
            onClick={createReport}
            title={figures === 0 ? 'Ask for a chart first: a report is built from figures' : undefined}
            className={btn({ variant: 'primary', size: 'sm' })}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Create report
          </button>
          <button type="button" onClick={reset} className={btn({ variant: 'secondary', size: 'sm' })}>
            <SquarePen className="h-3.5 w-3.5" aria-hidden />
            New chat
          </button>
        </div>
      )}
    </header>
  )
}

export default function InsightsChat({ catalog, fallback }: { catalog: SqlCatalog; fallback?: React.ReactNode }) {
  const narrow = useNarrow()
  return (
    <AdminCopilotSession fallback={fallback} onNewConversation={resetFigures}>
      <InsightsAgent catalog={catalog} />
      <AdminChat
        agentId={INSIGHTS_AGENT_ID}
        welcomeScreen={InsightsWelcome}
        placeholder={narrow ? 'Ask Hana about your data' : 'Ask Hana about learners, courses or mentoring'}
        footnote="Hana can make mistakes. Every figure shows the query behind it."
        header={<InsightsHeader catalog={catalog} />}
        className="admin-ai h-full flex-1"
      />
    </AdminCopilotSession>
  )
}
