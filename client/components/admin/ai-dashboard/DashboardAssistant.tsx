'use client'

/**
 * AI Dashboard: the assistant half of the page, driving the `dashboardBuilder`
 * agent. Lazily imported by the view so CopilotKit lands in its own chunk.
 *
 * The two-phase turn: `run_sql` runs a statement and returns the result's
 * SHAPE (columns, types, row count) with follow-up ON, so the graph is
 * re-invoked holding the columns and can choose a chart; `add_chart` then
 * draws it with follow-up OFF, because the card IS the outcome. Flip either
 * and the feature breaks in a way that looks like a model problem: nothing is
 * ever drawn, or the board fills with duplicate cards.
 *
 * No measured value is echoed back to the agent: the admin's data belongs on
 * the board, not in the transcript.
 */
import { useCallback, useState } from 'react'
import { z } from 'zod'
import { useAgent, useAgentContext, useCopilotKit, useFrontendTool, type JsonSerializable } from '@copilotkit/react-core/v2'
import { BarChart3, Check, Database, Loader2, Trash2, type LucideIcon } from 'lucide-react'
import { AdminCopilotSession } from '@/components/admin/ai-shared/AdminCopilot'
import { AdminChat, useConversation, type WelcomeScreenProps } from '@/components/admin/ai-shared/AdminChat'
import { runOnce, toolCallKey, useToolCallSettled } from '@/components/admin/ai-shared/toolCalls'
import '@/components/admin/ai-shared/admin-ai.css'
import { HanaPortrait } from '@/components/dashboard/HanaMessages'
import { AI_CHART_TYPES, runAiSql, sqlErrorMessage, type AiChartSpec, type SqlCatalog, type SqlQueryResult } from '@/lib/api/adminAi'
import { cn } from '@/lib/utils'
import { specCacheKey } from './chartData'

/** Exact key potential-ai matches to lift the catalogue out of the context array. */
const CATALOG_CONTEXT_KEY = '__catalog__'

/** The LangGraph graph exposed by potential-ai. */
export const DASHBOARD_AGENT_ID = 'dashboardBuilder'

export interface ChartInstance {
  id: string
  spec: AiChartSpec
}

/** `offer_choices` calls already answered: a spent set of buttons stays spent across remounts. */
const answeredChoices = new Map<string, string>()

const ICE_BREAKERS = [
  'Add a chart of new learners per month',
  'Add a chart of learners by country',
  'Compare course completions by course',
  'Add a stat for total certificates issued',
] as const

function ToolChip({
  toolCallId,
  status,
  runningLabel,
  doneLabel,
  icon: Icon,
}: {
  toolCallId: string
  status: unknown
  runningLabel: string
  doneLabel: string
  icon: LucideIcon
}) {
  const running = !useToolCallSettled(toolCallId, status)
  return (
    <div className="my-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-ui-line bg-ui-surface px-3 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ui-brand-soft text-ui-brand-text">
        {running ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Icon className="h-3 w-3" aria-hidden />}
      </span>
      <span className="truncate text-[13px] font-medium text-ui-text">{running ? runningLabel : doneLabel}</span>
      {!running && <Check className="h-3.5 w-3.5 shrink-0 text-ui-ok" aria-hidden />}
    </div>
  )
}

interface ChoiceOption {
  label: string
  value: string
}

/** `offer_choices` as real buttons: a click is sent as the admin's reply. */
function OfferChoices({
  toolCallId,
  args,
  status,
}: {
  toolCallId: string
  args: Partial<{ question: string; options: ChoiceOption[]; allowFreeText: boolean }>
  status: unknown
}) {
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId: DASHBOARD_AGENT_ID })
  const [answer, setAnswer] = useState<string | null>(() => answeredChoices.get(toolCallId) ?? null)
  // Arguments stream in token by token; nothing is clickable until they land.
  const streaming = String(status) === 'inProgress'
  const options = (args.options ?? []).filter(
    (option): option is ChoiceOption => !!option && typeof option.label === 'string' && typeof option.value === 'string',
  )

  const send = useCallback(
    async (value: string) => {
      if (answeredChoices.has(toolCallId)) return
      answeredChoices.set(toolCallId, value)
      setAnswer(value)
      agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: value })
      try {
        await copilotkit.runAgent({ agent })
      } catch {
        /* the connection notice surfaces run failures */
      }
    },
    [agent, copilotkit, toolCallId],
  )

  if (options.length === 0) return null
  return (
    <div className="my-2">
      {args.question && <p className="mb-2 text-sm text-ui-text">{args.question}</p>}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={args.question || 'Choose an option'}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="hana-chip"
            disabled={streaming || answer !== null}
            aria-pressed={answer === option.value}
            onClick={() => void send(option.value)}
            style={
              answer === option.value
                ? { borderColor: 'var(--ui-brand)', background: 'var(--ui-brand-soft)', color: 'var(--ui-brand-text)' }
                : undefined
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      {answer === null && args.allowFreeText !== false && (
        <p className="mt-2 text-xs text-ui-muted">Or type your own answer below.</p>
      )}
    </div>
  )
}

/**
 * What `run_sql` hands back: the result's shape as JSON (declared column types
 * pick a better chart than types inferred from the first row), never values.
 */
function describeResult(result: SqlQueryResult): string {
  return JSON.stringify({
    columns: result.columns.map((name, i) => ({ name, type: result.columnTypes?.[i] ?? '' })),
    rowCount: result.rowCount,
    truncated: result.truncated,
  })
}

const runSqlParameters = z.object({
  sql: z
    .string()
    .describe(
      'A single PostgreSQL SELECT using only the views and columns listed in the catalogue. No DDL, no DML, ' +
        'no multiple statements; anything else is rejected.',
    ),
  purpose: z
    .string()
    .max(120)
    .optional()
    .describe("One short human sentence saying what this query is for, e.g. 'Learners per month'."),
})

const addChartParameters = z.object({
  sql: z.string().describe('The statement whose rows this chart plots, normally the one just run with run_sql, verbatim.'),
  chartType: z
    .enum(AI_CHART_TYPES)
    .describe(
      "How to draw it. Must be one of the catalogue's chartTypes and suit the result: kpi is one number and " +
        'takes no x; scatter needs a numeric x; combo needs at least two value columns.',
    ),
  encoding: z
    .object({
      x: z
        .string()
        .optional()
        .describe('Column for the category or time axis, verbatim from the result. Required by everything except kpi and table.'),
      y: z
        .union([z.string(), z.array(z.string()).min(1).max(12)])
        .describe('The numeric value column, or columns. combo plots the first as bars and the rest as lines.'),
      series: z
        .string()
        .optional()
        .describe('Column whose distinct values each become one series (a pivot). Only with a single y column.'),
    })
    .describe('Which result column plays which visual role.'),
  valueFormat: z
    .enum(['number', 'percent', 'duration_days', 'hours'])
    .optional()
    .describe('The unit of the y values, so the axis and tooltips read correctly. Omit for a plain count.'),
  title: z.string().max(200).optional().describe('Human-readable chart title.'),
})

const offerChoicesParameters = z.object({
  question: z.string().max(300).describe("Short prompt shown above the buttons, e.g. 'Group by what?'"),
  options: z
    .array(
      z.object({
        label: z.string().max(60).describe("Button text, e.g. 'By country'."),
        value: z.string().max(300).describe("The message sent back as the admin's reply when clicked. Write it as the admin would."),
      }),
    )
    .min(1)
    .max(8),
  allowFreeText: z.boolean().optional().describe('Whether the admin may answer freely instead. Defaults to true.'),
})

interface DashboardAgentProps {
  catalog: SqlCatalog
  charts: ChartInstance[]
  onAddChart: (spec: AiChartSpec) => Promise<string>
  onRemoveChart: (id: string) => boolean
}

function DashboardAgent({ catalog, charts, onAddChart, onRemoveChart }: DashboardAgentProps) {
  // The ONLY schema the agent sees: names, grains, enum values, prose and the
  // chart types this board can draw. No data values.
  useAgentContext({
    description: CATALOG_CONTEXT_KEY,
    value: {
      ...catalog,
      chartTypes: catalog.chartTypes?.length ? catalog.chartTypes : [...AI_CHART_TYPES],
    } as unknown as JsonSerializable,
  })

  useAgentContext({
    description: "Charts currently on the admin's dashboard. Metadata only, no values. Use these ids with remove_chart.",
    value: charts.map((chart) => ({
      id: chart.id,
      title: chart.spec.title ?? null,
      chartType: chart.spec.chartType,
      encoding: chart.spec.encoding,
    })) as unknown as JsonSerializable,
  })

  useFrontendTool({
    name: 'run_sql',
    description:
      "Run one read-only PostgreSQL SELECT against Hadafi's reporting views and get the result's shape back. " +
      'Charting takes two steps: query first, then add_chart, because the chart type and the encoding are ' +
      "chosen from the columns this returns. If the statement is rejected you receive the guard's reasons or " +
      'the Postgres error verbatim; read it, fix the statement and call again.',
    parameters: runSqlParameters,
    // followUp is LEFT ON: the result is an input to the next step.
    handler: async ({ sql }, context) => {
      const statement = String(sql)
      const { key, stable } = toolCallKey(context?.toolCall?.id, `run_sql:${statement}`)
      return runOnce(key, stable, async () => {
        try {
          return describeResult(await runAiSql(statement))
        } catch (error) {
          // Returned, not thrown: this text is how the model self-corrects.
          return sqlErrorMessage(error)
        }
      })
    },
    render: ({ toolCallId, args, status }) => (
      <ToolChip
        toolCallId={toolCallId}
        status={status}
        runningLabel={args?.purpose ? `${args.purpose}…` : 'Querying…'}
        doneLabel={args?.purpose ? String(args.purpose) : 'Query ran'}
        icon={Database}
      />
    ),
  })

  useFrontendTool({
    name: 'add_chart',
    description:
      "Render a chart on the admin's dashboard from a statement you have already run. The rows are fetched " +
      "again in the admin's browser. You receive only a confirmation, never the resulting values. If the spec " +
      'is rejected you get the reasons back; fix them and call again.',
    parameters: addChartParameters,
    handler: async (args, context) => {
      const spec = args as unknown as AiChartSpec
      const { key, stable } = toolCallKey(context?.toolCall?.id, `add_chart:${specCacheKey(spec)}`)
      return runOnce(key, stable, () => onAddChart(spec))
    },
    // The chart IS the outcome; a follow-up run re-issues the call with a new
    // id and fills the board with duplicates.
    followUp: false,
    render: ({ toolCallId, args, status }) => (
      <ToolChip
        toolCallId={toolCallId}
        status={status}
        runningLabel={args?.title ? `Building “${args.title}”…` : 'Building chart…'}
        doneLabel={args?.title ? `Added “${args.title}”` : 'Added chart'}
        icon={BarChart3}
      />
    ),
  })

  useFrontendTool({
    name: 'remove_chart',
    description: "Remove a chart from the admin's dashboard by its id, as listed in the dashboard context.",
    parameters: z.object({ chartId: z.string().describe("The chart id, e.g. 'chart-2'.") }),
    handler: async ({ chartId }, context) => {
      const id = String(chartId)
      const { key, stable } = toolCallKey(context?.toolCall?.id, `remove_chart:${id}`)
      return runOnce(key, stable, async () =>
        onRemoveChart(id) ? `Removed ${id}.` : `No chart with id ${id} is on the dashboard.`,
      )
    },
    followUp: false,
    render: ({ toolCallId, args, status }) => (
      <ToolChip
        toolCallId={toolCallId}
        status={status}
        runningLabel="Removing chart…"
        doneLabel={args?.chartId ? `Removed ${args.chartId}` : 'Removed chart'}
        icon={Trash2}
      />
    ),
  })

  useFrontendTool({
    name: 'offer_choices',
    description:
      'Ask the admin to pick from a short list of options, rendered as clickable buttons. Use this instead of ' +
      "writing the options out as a list; never do both. Each option's `value` is the exact message sent back " +
      "as the admin's reply when clicked. The tool returns as soon as the buttons are shown; stop and wait for " +
      "the admin's next message.",
    parameters: offerChoicesParameters,
    followUp: false,
    handler: async ({ options }) =>
      `Showed the admin ${Array.isArray(options) ? options.length : 0} clickable option(s). Do not repeat them as text; wait for their reply.`,
    render: OfferChoices,
  })

  return null
}

function DashboardWelcome({ input, className }: WelcomeScreenProps) {
  const { send, running } = useConversation(DASHBOARD_AGENT_ID)
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="ai-welcome flex items-start gap-2.5">
          <HanaPortrait size={32} />
          <div className="hana-bubble w-fit text-[14px]">
            Tell me what the dashboard should show. I query Hadafi&rsquo;s reporting views, pick a chart that suits
            the answer, and it lands on the board.
          </div>
        </div>
        <div className="hana-lead mt-3 flex flex-wrap gap-1.5">
          {ICE_BREAKERS.map((text) => (
            <button key={text} type="button" className="hana-chip ai-starter" disabled={running} onClick={() => void send(text)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0">{input}</div>
    </div>
  )
}

function DashboardAssistantHeader() {
  const { reset, hasMessages } = useConversation(DASHBOARD_AGENT_ID)
  return (
    <header className="flex flex-shrink-0 items-center gap-2.5 border-b border-ui-line bg-ui-surface px-4 py-3">
      <HanaPortrait size={32} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold leading-tight text-ui-text">Hana</h2>
        <p className="truncate text-xs text-ui-muted">Builds charts on this board</p>
      </div>
      {hasMessages && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text"
        >
          New chat
        </button>
      )}
    </header>
  )
}

export default function DashboardAssistant(props: DashboardAgentProps & { fallback?: React.ReactNode }) {
  const { fallback, ...agentProps } = props
  return (
    <AdminCopilotSession fallback={fallback}>
      <DashboardAgent {...agentProps} />
      <AdminChat
        agentId={DASHBOARD_AGENT_ID}
        welcomeScreen={DashboardWelcome}
        placeholder="Describe a chart…"
        footnote="Hana writes the SQL herself. Check a chart before sharing it."
        header={<DashboardAssistantHeader />}
        className="admin-ai admin-ai--narrow h-full flex-1"
      />
    </AdminCopilotSession>
  )
}
