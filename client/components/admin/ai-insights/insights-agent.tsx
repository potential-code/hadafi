'use client'

/**
 * AI Insights: the agent wiring. The catalogue (fetched by the page) is handed
 * to the `dataChat` agent as context; Hana answers by calling `run_sql`,
 * `show_chart` and `create_report`, which the browser runs through the Hadafi
 * server (`/api/admin/ai/query`, guarded and read-only). Every statement is
 * disclosed to the admin verbatim: an answer nobody can audit is not one.
 */
import { useCallback, useState } from 'react'
import { z } from 'zod'
import { useAgent, useAgentContext, useFrontendTool, type JsonSerializable } from '@copilotkit/react-core/v2'
import { Check, ChevronRight, Copy, Database, Loader2 } from 'lucide-react'
import { FIGURE_CHARTS, runAiSql, sqlErrorMessage, type SqlCatalog, type SqlQueryResult, type SqlValue } from '@/lib/api/adminAi'
import { guarded, runOnce, toolCallKey, useToolCallSettled } from '@/components/admin/ai-shared/toolCalls'
import { cn } from '@/lib/utils'
import { FigureCard } from './figure-card'
import { ReportCard } from './report-card'
import {
  figureByNumber,
  reserveNumber,
  saveReport,
  settleFigure,
  startFigure,
  toFigureCell,
  useFigure,
  useReport,
} from './figure-store'

/**
 * Exact key potential-ai matches to lift the catalogue out of the AG-UI
 * context array. Changing it silently starves the agent of its schema.
 */
const CATALOG_CONTEXT_KEY = '__catalog__'

/** The LangGraph graph exposed by potential-ai. */
export const INSIGHTS_AGENT_ID = 'dataChat'

/**
 * Fixed openers: never generated, which would cost a model call before the
 * admin has typed anything. One per thing Hana can do here.
 */
export const STARTERS = [
  { kind: 'chart', text: 'Which countries are our learners from?' },
  { kind: 'chart', text: 'How many lessons were completed each month this year?' },
  { kind: 'data', text: 'Which course has the most certificates issued?' },
  { kind: 'chart', text: 'Average final exam score by course, compared with the pre-test' },
  { kind: 'report', text: 'Write a monthly impact report for our board' },
] as const

interface SqlRunMeta {
  rowCount: number
  elapsedMs: number
  failed: boolean
}

/** What each `run_sql` call did, keyed by tool-call id (the handler returns a string). */
const sqlRunMeta = new Map<string, SqlRunMeta>()

// A `|` or a newline inside a value would shift every later column, or split
// one row into two, when the model reads the table back.
const escapeForTable = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '\\n')
const cell = (value: SqlValue): string => escapeForTable(value === null ? 'NULL' : String(value))

/**
 * A compact pipe-delimited table, not JSON: JSON repeats every column name on
 * every row. potential-ai's reader finds the header by `/^rows:\s*\d+/` and
 * truncation by a line starting `truncated:`.
 */
function formatRows(columns: string[], rows: SqlValue[][], rowCount: number, truncated: boolean): string {
  const lines = [`rows: ${rowCount}`, columns.map(escapeForTable).join('|')]
  for (const row of rows.slice(0, rowCount)) lines.push(row.map(cell).join('|'))
  if (truncated) {
    lines.push(
      `truncated: true — only the first ${rowCount} rows are shown. Aggregate or add a LIMIT if you need the whole picture.`,
    )
  }
  return lines.join('\n')
}

const formatDuration = (ms: number): string => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)

/** The transcript's record of one `run_sql` call: a one-line summary that expands to the statement. */
function SqlDisclosure({ toolCallId, args, status }: { toolCallId: string; args: Partial<{ sql: string; purpose: string }>; status: unknown }) {
  const settled = useToolCallSettled(toolCallId, status)
  const [copied, setCopied] = useState(false)
  const sql = typeof args.sql === 'string' ? args.sql : ''
  const meta = settled ? sqlRunMeta.get(toolCallId) : undefined

  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(sql)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }, [sql])

  const label = args.purpose?.trim() || 'Ran a query'
  const summary = !settled
    ? `${label}…`
    : meta?.failed
      ? `${label} · refused, correcting`
      : meta
        ? `${label} · ${meta.rowCount} row${meta.rowCount === 1 ? '' : 's'} · ${formatDuration(meta.elapsedMs)}`
        : label

  return (
    <details className="group my-1.5 overflow-hidden rounded-[10px] border border-ui-line bg-ui-surface" data-testid="ai-sql">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-ui-text outline-none hover:bg-ui-surface-2 focus-visible:ring-2 focus-visible:ring-ui-brand/30 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ui-muted transition-transform group-open:rotate-90" aria-hidden />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ui-brand-soft">
          {!settled ? (
            <Loader2 className="h-3 w-3 animate-spin text-ui-brand-text" aria-hidden />
          ) : (
            <Database className={cn('h-3 w-3', meta?.failed ? 'text-ui-muted' : 'text-ui-brand-text')} aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{summary}</span>
        <span className="shrink-0 text-xs text-ui-muted group-open:hidden">Show SQL</span>
      </summary>
      <div className="flex items-start gap-2 border-t border-ui-line p-2">
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-ui-line bg-ui-surface-2 p-2 font-mono text-xs leading-relaxed text-ui-text">
          {sql || '—'}
        </pre>
        <button
          type="button"
          onClick={copy}
          disabled={!sql}
          aria-label={copied ? 'SQL copied' : 'Copy SQL'}
          title={copied ? 'SQL copied' : 'Copy SQL'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ui-line bg-ui-surface text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text disabled:opacity-40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-ui-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
    </details>
  )
}

const sqlParameter = z
  .string()
  .describe(
    'A single PostgreSQL SELECT using only the views and columns listed in the catalogue. ' +
      'No DDL, no DML, no multiple statements; anything else is rejected.',
  )

const runSqlParameters = z.object({
  sql: sqlParameter,
  purpose: z
    .string()
    .max(120)
    .optional()
    .describe(
      "One short human sentence saying what this query is for, e.g. 'Learners by country'. " +
        'Shown to the admin as the label on the disclosed statement.',
    ),
})

interface WireToolCall {
  id?: string
  function?: { name?: string }
  name?: string
}

/** Where a call sits among the figure calls of the message that made it (see `reserveNumber`). */
function placeOf(
  messages: readonly unknown[],
  toolCallId: string | undefined,
): { messageId: string; position: number; size: number } | null {
  if (!toolCallId) return null
  for (const message of messages) {
    const m = message as { id?: string; toolCalls?: WireToolCall[]; tool_calls?: WireToolCall[] }
    const calls = (m.toolCalls ?? m.tool_calls ?? []).filter((c) => (c.function?.name ?? c.name) === 'show_chart')
    const position = calls.findIndex((c) => c.id === toolCallId)
    if (position >= 0) return { messageId: m.id ?? toolCallId, position, size: calls.length }
  }
  return null
}

/** The platform numbers figures; a title that says "Figure 4. Countries" doubles it. */
function cleanTitle(title: string): string {
  return title.replace(/^\s*fig(?:ure)?\.?\s*\d+\s*[.:)\-–—]?\s*/i, '').trim() || title.trim()
}

/** Arguments stream in before the handler runs; until then, say what is coming. */
function PendingOr({ toolCallId, kind }: { toolCallId: string; kind: 'figure' | 'report' }) {
  const figure = useFigure(toolCallId)
  const report = useReport(toolCallId)
  if (kind === 'figure' && figure) return <FigureCard toolCallId={toolCallId} />
  if (kind === 'report' && report) return <ReportCard toolCallId={toolCallId} />
  return (
    <p className="my-1.5 flex items-center gap-2 text-[13px] text-ui-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-ui-brand-text" aria-hidden />
      {kind === 'figure' ? 'Drawing a figure…' : 'Assembling the report…'}
    </p>
  )
}

export interface InsightsAgentOptions {
  catalog: SqlCatalog
  /** Where statements run. Defaults to `/api/admin/ai/query`. */
  runSql?: (sql: string) => Promise<SqlQueryResult>
  /** How the tools name the data, e.g. "the Hadafi reporting views". */
  dataLabel?: string
  /** Offer `create_report` (AI Insights only). */
  reports?: boolean
}

export function InsightsAgent({
  catalog,
  runSql = runAiSql,
  dataLabel = 'the Hadafi reporting views',
  reports = true,
}: InsightsAgentOptions) {
  // Read inside handlers for each call's place in its message; no re-render needed.
  const { agent } = useAgent({ agentId: INSIGHTS_AGENT_ID, updates: [] })

  // The ONLY thing the agent is shown up front: view names, grains, column
  // names and types, enum values and the guard's limits. No data values.
  useAgentContext({
    description: CATALOG_CONTEXT_KEY,
    value: catalog as unknown as JsonSerializable,
  })

  useFrontendTool({
    name: 'run_sql',
    description:
      `Run one read-only PostgreSQL SELECT against ${dataLabel} and get the rows back as a ` +
      'text table. Use it for a single number or a quick check; for anything with several rows to show ' +
      '(per month, per category, a ranking, a comparison) use show_chart instead, so the admin sees a figure. ' +
      'Answer with real numbers; never guess. If the statement is rejected you ' +
      "receive the guard's reasons or the Postgres error verbatim: read it, fix the statement and call again.",
    parameters: runSqlParameters,
    // followUp stays on (the default): the rows are an input to the answer.
    handler: async ({ sql }, context) => {
      const statement = String(sql)
      const toolCallId = context?.toolCall?.id
      const { key, stable } = toolCallKey(toolCallId, `run_sql:${statement}`)
      return runOnce(key, stable, async () => {
        const startedAt = performance.now()
        try {
          const result = await runSql(statement)
          if (toolCallId) {
            sqlRunMeta.set(toolCallId, {
              rowCount: result.rowCount,
              elapsedMs: result.elapsedMs ?? performance.now() - startedAt,
              failed: false,
            })
          }
          return formatRows(result.columns, result.rows, result.rowCount, result.truncated)
        } catch (error) {
          if (toolCallId) sqlRunMeta.set(toolCallId, { rowCount: 0, elapsedMs: performance.now() - startedAt, failed: true })
          // Returned, not thrown: this text is how the model self-corrects.
          return sqlErrorMessage(error)
        }
      })
    },
    render: ({ toolCallId, args, status }) => <SqlDisclosure toolCallId={toolCallId} args={args ?? {}} status={status} />,
  })

  useFrontendTool({
    name: 'show_chart',
    description:
      'Draw a numbered figure for the admin from one read-only PostgreSQL SELECT, under the same rules as ' +
      'run_sql. The chart is drawn from the rows the query returns, and the rows also come back to you as a ' +
      'text table to write your answer from. Use it whenever the answer is a breakdown, a ranking, a trend ' +
      `over time or a comparison, or the admin asks for a chart${reports ? ', and for every item in a report' : ''}; run_sql ` +
      'draws nothing. Refer to the result by the figure number this tool returns. Keep categories to about a dozen.',
    parameters: z.object({
      sql: sqlParameter,
      title: z
        .string()
        .max(140)
        .describe("A plain title, e.g. 'Learners by country'. No figure number; the platform adds it."),
      chart: z
        .enum(FIGURE_CHARTS)
        .describe(
          'bar: compare a few categories · horizontal_bar: rank many, or long labels · line: a trend over dates · ' +
            'donut: shares of one whole (6 parts or fewer) · stat: one row of headline numbers · table: anything else.',
        ),
      x: z.string().optional().describe('The category or date column. Defaults to the first text column.'),
      y: z
        .array(z.string())
        .max(3)
        .optional()
        .describe('The value columns to plot, up to three. Defaults to every numeric column.'),
    }),
    handler: guarded(async ({ sql, title, chart, x, y }, context) => {
      const toolCallId = context?.toolCall?.id ?? crypto.randomUUID()
      const { key, stable } = toolCallKey(context?.toolCall?.id, `show_chart:${String(sql)}`)
      return runOnce(key, stable, async () => {
        const figure = startFigure(
          {
            toolCallId,
            title: cleanTitle(String(title ?? 'Untitled figure')),
            chart: (FIGURE_CHARTS as readonly string[]).includes(String(chart)) ? chart : 'table',
            x: typeof x === 'string' ? x : undefined,
            y: Array.isArray(y) ? y.map(String) : undefined,
            sql: String(sql),
          },
          reserveNumber(placeOf(agent.messages, context?.toolCall?.id)),
        )
        try {
          const result = await runSql(String(sql))
          settleFigure(toolCallId, {
            status: 'ready',
            columns: result.columns,
            rows: result.rows.map((row) => row.map(toFigureCell)),
            truncated: result.truncated,
          })
          return (
            `Figure ${figure.number} is drawn for the admin: "${figure.title}".\n` +
            formatRows(result.columns, result.rows, result.rowCount, result.truncated)
          )
        } catch (error) {
          const message = sqlErrorMessage(error)
          settleFigure(toolCallId, { status: 'failed', error: message })
          return `Figure ${figure.number} could not be drawn:\n${message}\nFix the statement and call show_chart again.`
        }
      })
    }, 'show_chart'),
    render: ({ toolCallId }) => <PendingOr toolCallId={toolCallId} kind="figure" />,
  })

  useFrontendTool({
    name: 'create_report',
    available: reports,
    description:
      'Assemble a downloadable report (PDF and Excel) from figures already drawn in this conversation. ' +
      "Use every figure already drawn that bears on the report's subject first, and draw new figures only for " +
      'what is still missing. When the admin asked for a report, call this in the same turn once the figures ' +
      'are drawn; never stop to offer it. Draw every figure the report needs FIRST with show_chart, then call ' +
      "this with their numbers. Write the summary and each section's text only from numbers those figures " +
      "returned. The server re-runs every figure when the admin downloads, so the file's numbers are the " +
      "data's own. After calling, reply in one or two sentences; do not repeat the report's contents.",
    parameters: z.object({
      title: z.string().max(140),
      summary: z.string().max(3000).describe('Two to four sentences: the headline findings.'),
      sections: z
        .array(
          z.object({
            heading: z.string().max(140),
            body: z.string().max(5000).describe("Plain sentences; '-' starts a bullet."),
            figures: z.array(z.number().int()).max(6).describe('Figure numbers shown in this section.'),
          }),
        )
        .min(1)
        .max(8),
    }),
    handler: guarded(async ({ title, summary, sections }, context) => {
      const toolCallId = context?.toolCall?.id ?? crypto.randomUUID()
      if (!Array.isArray(sections) || sections.length === 0) {
        return 'A report needs at least one section with the figure numbers it holds. Call create_report again.'
      }
      const asked = sections.flatMap((section) => (Array.isArray(section.figures) ? section.figures : []))
      const missing = asked.filter((n) => figureByNumber(n)?.status !== 'ready')
      saveReport({
        toolCallId,
        title: String(title ?? 'Report'),
        summary: String(summary ?? ''),
        sections: sections.map((section) => ({
          heading: String(section.heading ?? ''),
          body: String(section.body ?? ''),
          figures: (Array.isArray(section.figures) ? section.figures : []).filter((n) => !missing.includes(n)),
        })),
        missing,
      })
      return (
        'The report is ready for the admin to download as PDF or Excel from the card in the chat.' +
        (missing.length ? ` Figures ${missing.join(', ')} were never drawn and were left out.` : '')
      )
    }, 'create_report'),
    render: ({ toolCallId }) => <PendingOr toolCallId={toolCallId} kind="report" />,
  })

  return null
}
