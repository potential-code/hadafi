'use client'

/**
 * Multi Learning: Hana as the tutor, a conversation that is also the course
 * player. Ported from SMEEP's SanaTutor (ec12753, a906242 and later fixes),
 * on potential-ai's `smeepTutor` graph (Hana's persona for platform `hadafi`).
 *
 * Who decides what:
 *   - Hadafi computes where the learner is (the course state). It is sent to
 *     Hana on every run and drives the course rail, so both show one truth.
 *   - Hana decides what to say and which card to open, following that
 *     state's NEXT STEP, and answers questions in between.
 *   - Learner actions (continue, save a plan, submit an exam) are recorded
 *     through /api/multi-learning first, where the server checks them; the
 *     page then refreshes the state and tells Hana in a hidden message.
 *
 * The page sends no system prompt: the tutor's instructions live in
 * potential-ai. Per-learner and per-course data go in context entries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { flushSync } from 'react-dom'
import { z } from 'zod'
import '@copilotkit/react-ui/v2/styles.css'
import {
  CopilotChat,
  ToolCallStatus,
  UseAgentUpdate,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
} from '@copilotkit/react-core/v2'
import { ChevronLeft, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { HanaAssistantMessage, HanaPortrait, HanaTypingIndicator, HanaUserMessage } from '@/components/dashboard/HanaMessages'
import { HanaChatInput, HanaComposerOptions } from '@/components/dashboard/HanaChatInput'
import { HanaConnectionNotice, useHanaRunError } from '@/components/dashboard/HanaRunError'
import { ChatLoadingContext } from '@/components/dashboard/chat-loading-context'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import { useNarrow } from '@/components/dashboard/useNarrow'
import '@/components/dashboard/hana-studio.css'
import { tutorApi, type CourseState, type NextStep, type UnitStep } from './api'
import { TutorContext, useTutor, type TutorSession } from './context'
import { ui } from './strings'
import {
  CardSkeleton,
  CoursesCard,
  NEXT_MARKER,
  QuestionStepCard,
  SummaryCard,
  TutorQuizCard,
  UnitIntroCard,
  VideoCard,
} from './TutorCards'
import { CourseRail, CourseStrip } from './CourseRail'
import { HanaReplyActionsProvider } from '@/components/dashboard/HanaReplyButtons'

/** potential-ai's agent name (a wire contract shared with SMEEP). */
export const TUTOR_AGENT_ID = 'smeepTutor'
const LEARNER_KEY = '__tutor_learner__'
const COURSE_STATE_KEY = '__tutor_course_state__'
const ON_SCREEN_KEY = '__tutor_on_screen__'

/** Ids of driver messages the learner never sees as chat bubbles. */
const hiddenIds = new Set<string>()

function TutorUserMessage(props: Parameters<typeof HanaUserMessage>[0]) {
  const m = props.message as { id?: string; content?: unknown } | undefined
  const text = typeof m?.content === 'string' ? m.content : ''
  if (m?.id && hiddenIds.has(m.id)) return null
  if (/^\s*\[(next|quiz-result|action-plan|sys)\]/.test(text)) return null
  return <HanaUserMessage {...props} />
}

const RAIL_KEY = 'hadafi.tutor.rail'
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* storage blocked: not remembered */
    }
  },
}

// ── Cards as tool renders ───────────────────────────────────────────────────

function useLatest(toolCallId: string) {
  return useTutor().latestCallId === toolCallId
}
function ShowCoursesRender({ toolCallId }: { toolCallId: string }) {
  return <CoursesCard latest={useLatest(toolCallId)} />
}
function ShowUnitIntroRender({ unitId, toolCallId }: { unitId: string; toolCallId: string }) {
  return <UnitIntroCard unitId={unitId} latest={useLatest(toolCallId)} />
}
function ShowVideoRender({ learningBlockId, toolCallId }: { learningBlockId: string; toolCallId: string }) {
  return <VideoCard learningBlockId={learningBlockId} latest={useLatest(toolCallId)} />
}
function ShowSummaryRender(props: { unitId: string; title?: string; content?: string; keyPoints?: string[]; toolCallId: string }) {
  const { toolCallId, ...rest } = props
  return <SummaryCard {...rest} latest={useLatest(toolCallId)} />
}
function ShowStepRender({ learningBlockId, toolCallId }: { learningBlockId: string; toolCallId: string }) {
  return <QuestionStepCard learningBlockId={learningBlockId} latest={useLatest(toolCallId)} />
}
function ShowQuizRender({ assessmentId, toolCallId }: { assessmentId: string; toolCallId: string }) {
  return <TutorQuizCard assessmentId={assessmentId} latest={useLatest(toolCallId)} />
}

// ── Tools Hana can call (the smeepTutor contract) ───────────────────────────

function TutorTools({ openCourseSilently }: { openCourseSilently: (courseId: string) => Promise<CourseState | null> }) {
  const { api } = useTutor()

  useFrontendTool({
    name: 'show_courses',
    description:
      "Show the learner's enrolled courses as a card. The learner picks a course on the card; you will then receive their choice as a message.",
    parameters: z.object({}),
    followUp: false,
    render: ({ toolCallId }) => <ShowCoursesRender toolCallId={toolCallId} />,
    handler: async () => 'The course list is on screen. Wait for the learner to choose.',
  })

  useFrontendTool({
    name: 'start_course',
    description: 'Open a course by courseId when the learner asks for one in words. The page returns the course state.',
    parameters: z.object({ courseId: z.string().describe('A courseId from the course state.') }),
    handler: async ({ courseId }) => {
      const state = await openCourseSilently(String(courseId))
      return state?.active
        ? `Opened course ${courseId}.\n${state.text}`
        : `ERROR: course ${courseId} is not one of the learner's courses. Show the learner's courses instead.`
    },
  })

  useFrontendTool({
    name: 'load_unit',
    description: "Fetch a unit's teaching material (English source text) to summarise it or answer questions about it.",
    parameters: z.object({ unitId: z.string() }),
    handler: async ({ unitId }) => {
      try {
        return JSON.stringify(await api.unitMaterial(String(unitId)))
      } catch {
        return `ERROR: unit ${unitId} could not be loaded. Tell the learner briefly and offer to try again.`
      }
    },
  })

  useFrontendTool({
    name: 'show_unit_intro',
    description: "Show a unit's introduction and learning outcomes. The page supplies the content.",
    parameters: z.object({ unitId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.unitId ? (
        <CardSkeleton />
      ) : (
        <ShowUnitIntroRender unitId={String(args.unitId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_video',
    description: 'Show a video lesson by learningBlockId. The page supplies the video and its title.',
    parameters: z.object({ learningBlockId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.learningBlockId ? (
        <CardSkeleton />
      ) : (
        <ShowVideoRender learningBlockId={String(args.learningBlockId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_summary',
    description:
      "Show your summary of a unit, written from its loaded material in the learner's language: a title, two or three short paragraphs of content, and three to five key points.",
    parameters: z.object({ unitId: z.string(), title: z.string(), content: z.string(), keyPoints: z.array(z.string()) }),
    followUp: false,
    render: ({ args, toolCallId }) =>
      !args?.unitId ? (
        <CardSkeleton />
      ) : (
        <ShowSummaryRender
          unitId={String(args.unitId)}
          title={typeof args.title === 'string' ? args.title : undefined}
          content={typeof args.content === 'string' ? args.content : undefined}
          keyPoints={Array.isArray(args.keyPoints) ? args.keyPoints.map(String) : undefined}
          toolCallId={toolCallId}
        />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_action_plan',
    description:
      "Show a unit's action plan or check-in by learningBlockId: the card where the learner writes their own plan, or answers the unit's reflection questions. The page supplies the questions and sends you what the learner saved as a message.",
    parameters: z.object({ learningBlockId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.learningBlockId ? (
        <CardSkeleton />
      ) : (
        <ShowStepRender learningBlockId={String(args.learningBlockId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_quiz',
    description:
      "Show the course's pre-test or final exam by assessmentId (NEXT STEP says which). The page supplies the questions, Hadafi marks the answers, and the page sends you the result as a message.",
    parameters: z.object({ assessmentId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.assessmentId ? (
        <CardSkeleton />
      ) : (
        <ShowQuizRender assessmentId={String(args.assessmentId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  return null
}

// ── The session ────────────────────────────────────────────────────────────

/** A show_* call as the NextStep it puts on screen (null while it streams). */
function cardStep(name: string, args: Record<string, unknown> | null): NextStep | null {
  if (!args) return null
  const s = (k: string) => (typeof args[k] === 'string' && args[k] ? String(args[k]) : null)
  switch (name) {
    case 'show_courses':
      return { action: 'show_courses', reason: 'no_active_course' }
    case 'show_unit_intro':
      return s('unitId') ? { action: 'show_unit_intro', unitId: s('unitId')! } : null
    case 'show_video':
      return s('learningBlockId') ? { action: 'show_video', unitId: '', learningBlockId: s('learningBlockId')! } : null
    case 'show_summary':
      return s('unitId') ? { action: 'show_summary', unitId: s('unitId')! } : null
    case 'show_action_plan':
      return s('learningBlockId') ? { action: 'show_action_plan', unitId: '', learningBlockId: s('learningBlockId')! } : null
    case 'show_quiz':
      return s('assessmentId') ? { action: 'show_quiz', assessmentId: s('assessmentId')!, retake: false } : null
    default:
      return null
  }
}

function matchesNext(card: NextStep | null, next: NextStep | undefined): boolean {
  if (!next || !card) return false
  switch (card.action) {
    case 'show_courses':
      return next.action === 'show_courses'
    case 'show_unit_intro':
      return next.action === 'show_unit_intro' && card.unitId === next.unitId
    case 'show_video':
      return next.action === 'show_video' && card.learningBlockId === next.learningBlockId
    case 'show_summary':
      return next.action === 'show_summary' && card.unitId === next.unitId
    case 'show_action_plan':
      return next.action === 'show_action_plan' && card.learningBlockId === next.learningBlockId
    case 'show_quiz':
      return next.action === 'show_quiz' && card.assessmentId === next.assessmentId
  }
}

export function HanaTutor({ courseId, firstName }: { courseId: string; firstName: string }) {
  const { copilotkit } = useCopilotKit()
  const [threadId] = useState(() => makeUuid())
  const { agent } = useAgent({
    agentId: TUTOR_AGENT_ID,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG-UI agent shape is loose
  const agentRef = useRef<any>(null)
  agentRef.current = agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const running: boolean = Boolean((agent as any)?.isRunning)
  const narrow = useNarrow()

  const [state, setState] = useState<CourseState | null>(null)
  const activeRef = useRef<string | null>(courseId)
  const introSeen = useRef<Set<string>>(new Set())
  const [onScreen, setOnScreen] = useState('')

  const [railOpen, setRailOpenState] = useState(true)
  useEffect(() => setRailOpenState(storage.get(RAIL_KEY) !== '0'), [])
  const toggleRail = useCallback(() => {
    setRailOpenState((open) => {
      storage.set(RAIL_KEY, open ? '0' : null)
      return !open
    })
  }, [])

  const [runFailed, setRunFailed] = useHanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  // The state Hana sees is committed synchronously (flushSync), so the
  // context entry below is current before the next run starts.
  const refreshFor = useCallback(async (id: string | null): Promise<CourseState | null> => {
    try {
      const next = await tutorApi.state({ courseId: id, introSeen: [...introSeen.current] })
      flushSync(() => setState(next))
      return next
    } catch {
      return null
    }
  }, [])
  const refresh = useCallback(() => refreshFor(activeRef.current), [refreshFor])

  const openCourseSilently = useCallback(
    async (id: string) => {
      const next = await refreshFor(id)
      if (!next?.active) return null
      // The address stays as it is: changing it would remount the page and
      // restart the conversation. The header's link follows the open course.
      activeRef.current = id
      return next
    },
    [refreshFor],
  )

  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const send = useCallback(
    async (text: string, opts?: { hidden?: boolean }) => {
      if (!text.trim()) return
      setRunFailed(false)
      await (runChainRef.current = runChainRef.current.then(async () => {
        const live = agentRef.current
        try {
          const id = makeUuid()
          if (opts?.hidden) hiddenIds.add(id)
          live.addMessage({ id, role: 'user', content: text })
          await copilotkit.runAgent({ agent: live })
        } catch (err) {
          console.warn('[tutor] run failed', err)
        }
      }))
    },
    [copilotkit, setRunFailed],
  )

  const openCourse = useCallback(
    async (id: string, name: string) => {
      const next = await openCourseSilently(id)
      if (next) await send(ui.openCourseMessage(name))
    },
    [openCourseSilently, send],
  )

  const markIntroSeen = useCallback((unitId: string) => {
    introSeen.current.add(unitId)
  }, [])

  const stepFor = useCallback<TutorSession['stepFor']>(
    (kind, id) => {
      for (const unit of state?.active?.units ?? []) {
        for (const step of unit.steps) {
          if (step.kind !== kind) continue
          const match = step.kind === 'intro' || step.kind === 'reading' ? step.unitId === id : step.blockId === id
          if (match) return { step: step as UnitStep, unitOrder: unit.order, unitName: unit.name }
        }
      }
      return null
    },
    [state],
  )

  // The "card in hand": the newest show_* call that matches NEXT STEP, else
  // the newest. A card opened again for review stays reference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = (agent as any)?.messages ?? []
  const { latestCallId, latestCard } = useMemo(() => {
    let newest: { id: string; card: NextStep | null } | null = null
    let matching: { id: string; card: NextStep | null } | null = null
    for (const m of messages) {
      if (m.role !== 'assistant') continue
      for (const call of m.toolCalls ?? []) {
        const name: string = call.function?.name ?? ''
        if (!name.startsWith('show_')) continue
        let args: Record<string, unknown> | null = null
        try {
          args = JSON.parse(call.function?.arguments || '{}')
        } catch {
          /* still streaming */
        }
        const card = cardStep(name, args)
        newest = { id: call.id, card }
        if (matchesNext(card, state?.next)) matching = { id: call.id, card }
      }
    }
    const latest = matching ?? newest
    return { latestCallId: latest?.id ?? null, latestCard: latest?.card ?? null }
  }, [messages, state])
  const now: NextStep | null = latestCard ?? state?.next ?? null

  // Context entries: who the learner is, where they are, what is on screen.
  useAgentContext({ description: LEARNER_KEY, value: JSON.stringify({ language: 'en', firstName }) })
  useAgentContext({ description: COURSE_STATE_KEY, value: state?.text ?? 'MISSING' })
  useAgentContext({
    description: ON_SCREEN_KEY,
    value: onScreen ? `${onScreen} It is in the conversation on the learner's screen.` : 'No lesson card is open.',
  })

  // Start exactly once, after the tools above are registered and the runtime
  // is connected (polled: runtimeConnectionStatus isn't reactive). The latch
  // is set when the send fires, so StrictMode's throwaway mount can't eat it.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    const timer = window.setInterval(() => {
      if (startedRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = copilotkit as any
      if (core.runtimeConnectionStatus !== 'connected' || !core.getAgent?.(TUTOR_AGENT_ID)) return
      startedRef.current = true
      window.clearInterval(timer)
      window.setTimeout(() => {
        void (async () => {
          let latest = await refreshFor(activeRef.current)
          if (activeRef.current && !latest?.active) {
            // Not one of the learner's courses (not started, or unpublished).
            activeRef.current = null
            latest = await refreshFor(null)
          }
          await send(
            activeRef.current
              ? "[sys] I've opened this course to learn with you. Greet me by name first, then continue it."
              : "[sys] I've just arrived. Greet me by name and show me where to start.",
            { hidden: true },
          )
        })()
      }, 50)
    }, 150)
    return () => window.clearInterval(timer)
  }, [copilotkit, refreshFor, send])

  const session: TutorSession = {
    ui,
    api: tutorApi,
    state,
    running,
    latestCallId,
    now,
    refresh,
    openCourse,
    send,
    markIntroSeen,
    setOnScreen,
    stepFor,
  }

  const coursePage = `/dashboard/courses/${state?.active?.courseId ?? courseId}`
  const composer = useMemo(() => ({ placeholder: narrow ? ui.placeholderShort : ui.placeholder }), [narrow])

  return (
    <TutorContext.Provider value={session}>
      <TutorTools openCourseSilently={openCourseSilently} />
      <ChatLoadingContext.Provider value={running}>
        <div className="hana-studio hadafi-copilot relative flex min-h-0 flex-1 flex-col overflow-hidden bg-ui-bg">
          {runFailed && <HanaConnectionNotice onRetry={retryRun} />}

          <header className="relative z-[3] flex flex-shrink-0 items-center gap-2.5 border-b border-ui-line bg-ui-surface px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
            <Link
              href={coursePage}
              aria-label={ui.classicViewLong}
              title={ui.classicViewLong}
              className={cn(btn({ variant: 'secondary' }), 'h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3')}
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              <span className="hidden sm:inline">{ui.classicView}</span>
            </Link>
            <HanaPortrait size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-base font-semibold leading-tight text-ui-text sm:text-lg">{ui.pageTitle}</h1>
              <p className="truncate text-[13px] text-ui-muted">{state?.active?.name || ui.pageSubtitle}</p>
            </div>
            {state?.active && (
              <button
                type="button"
                onClick={toggleRail}
                aria-pressed={railOpen}
                aria-label={railOpen ? ui.hideRail : ui.showRail}
                title={railOpen ? ui.hideRail : ui.showRail}
                className={cn(btn({ variant: 'secondary', size: 'md' }), 'hidden h-9 w-9 px-0 lg:inline-flex', railOpen && 'bg-ui-surface-2')}
              >
                {railOpen ? (
                  <PanelRightClose className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
                ) : (
                  <PanelRightOpen className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            )}
          </header>

          <CourseStrip />

          <div className="relative z-[1] flex min-h-0 flex-1">
            <div className="hadafi-assistant-chat relative min-w-0 flex-1 overflow-hidden">
              <HanaComposerOptions.Provider value={composer}>
                <HanaReplyActionsProvider reportSurface="multi-learning" conversation={threadId}>
                  <CopilotChat
                    agentId={TUTOR_AGENT_ID}
                    threadId={threadId}
                    messageView={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      assistantMessage: HanaAssistantMessage as any,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      userMessage: TutorUserMessage as any,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      cursor: HanaTypingIndicator as any,
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    input={HanaChatInput as any}
                    labels={{ chatInputPlaceholder: composer.placeholder }}
                  />
                </HanaReplyActionsProvider>
              </HanaComposerOptions.Provider>
            </div>
            {railOpen && <CourseRail />}
          </div>
        </div>
      </ChatLoadingContext.Provider>
    </TutorContext.Provider>
  )
}
