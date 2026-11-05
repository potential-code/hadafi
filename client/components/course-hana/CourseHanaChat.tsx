'use client'

/**
 * The chat inside Hana's course panel: potential-ai's `smeepCourseHelp` agent
 * (Hana's persona for Hadafi) on the shared Hana chat, fed the live page.
 * Loaded on first open by `CourseHana`. The page sends no system prompt: the
 * agent's rules are set on potential-ai and can't be changed from here.
 *
 * Context: Hadafi's server builds the course part from this learner's own
 * course (GET /api/course-assistant/courses/:id/context: this course only, no
 * answer keys); the page adds the exam question on screen, which only the
 * browser knows.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAgentContext } from '@copilotkit/react-core/v2'
import { BookOpen, Compass, Lightbulb, MessageCircleQuestion, PanelRight, PictureInPicture2, SquarePen, X } from 'lucide-react'
import { AdminCopilotSession } from '@/components/admin/ai-shared/AdminCopilot'
import { AdminChat, useConversation, type WelcomeScreenProps } from '@/components/admin/ai-shared/AdminChat'
import '@/components/admin/ai-shared/admin-ai.css'
import { HanaPortrait } from '@/components/dashboard/HanaMessages'
import { HanaReplyActionsProvider } from '@/components/dashboard/HanaReplyButtons'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLiveExam, type LiveExam } from './liveStep'
import type { HanaLayout } from './CourseHana'

/** potential-ai's agent name (a wire contract shared with SMEEP). */
export const COURSE_HELP_AGENT_ID = 'smeepCourseHelp'
const CONTEXT_KEY = '__course_page__'

/** The step the page has open, in the page's terms. */
export type HanaStep =
  | { kind: 'block'; blockId: string; type: 'text' | 'video' | 'image' | 'question'; unitNumber: number }
  | { kind: 'assessment'; assessmentId: string; assessmentType: 'pre' | 'post' }

export type CourseHanaChatProps = {
  courseId: string
  enrolled: boolean
  step: HanaStep | null
  learnerName: string | null
  open: boolean
  onClose: () => void
  layout: HanaLayout
}

type Starter = { text: string; icon: typeof BookOpen }

function startersFor(enrolled: boolean, step: HanaStep | null): Starter[] {
  if (!enrolled) {
    return [
      { text: 'What will I learn in this course?', icon: BookOpen },
      { text: 'Is this course right for my business?', icon: Compass },
      { text: 'How does this course work?', icon: MessageCircleQuestion },
    ]
  }
  const where = { text: 'Where am I in this course?', icon: Compass }
  if (!step) return [where]
  if (step.kind === 'assessment') {
    return step.assessmentType === 'pre'
      ? [{ text: 'Why is there a pre-test?', icon: MessageCircleQuestion }, where]
      : [
          { text: 'Help me revise the key ideas', icon: Lightbulb },
          { text: 'How does the final exam work?', icon: MessageCircleQuestion },
          where,
        ]
  }
  if (step.type === 'question') {
    return [
      { text: 'Help me think this through', icon: Lightbulb },
      { text: 'Explain the idea behind this', icon: BookOpen },
      where,
    ]
  }
  return [
    { text: 'Explain this step in simple words', icon: BookOpen },
    { text: 'Give me a real business example', icon: Lightbulb },
    where,
  ]
}

function stepName(enrolled: boolean, step: HanaStep | null): string | null {
  if (!enrolled || !step) return null
  if (step.kind === 'assessment') return step.assessmentType === 'pre' ? 'the pre-test' : 'the final exam'
  return `unit ${step.unitNumber}`
}

/** The exam on screen, as SMEEP describes it to the agent. No answer keys exist in the browser. */
function examOnScreen(exam: LiveExam) {
  if (exam.view === 'taking') {
    return {
      screen: 'answering questions',
      question: `${exam.questionNumber} of ${exam.totalQuestions}`,
      questionText: exam.question,
      options: exam.options,
      answered: exam.answeredCount,
    }
  }
  return {
    screen: exam.view === 'result' ? 'results' : 'start screen',
    ...(exam.totalQuestions != null ? { questions: exam.totalQuestions } : {}),
    ...(exam.score != null ? { lastScore: `${exam.score}%`, passed: exam.passed } : {}),
    ...(exam.attemptsRemaining != null && exam.attemptsRemaining >= 0 ? { attemptsLeft: exam.attemptsRemaining } : {}),
  }
}

/** Keeps the agent's view of the page current; renders nothing. */
function CoursePageContext({ courseId, step, learnerName }: Pick<CourseHanaChatProps, 'courseId' | 'step' | 'learnerName'>) {
  const stepParam = !step ? '' : step.kind === 'assessment' ? step.assessmentType : step.blockId
  const { data } = useQuery({
    queryKey: ['course-assistant', courseId, stepParam],
    queryFn: async () => {
      const q = stepParam ? `?step=${encodeURIComponent(stepParam)}` : ''
      const res = await apiFetch<{ data: Record<string, unknown> }>(`/api/course-assistant/courses/${courseId}/context${q}`)
      return res.data
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
  const exam = useLiveExam()
  const value = useMemo(() => {
    if (!data) return JSON.stringify({ page: 'Course page', note: 'Still loading the course.' })
    const liveExam = step?.kind === 'assessment' && exam?.assessmentId === step.assessmentId ? exam : null
    const onScreen =
      liveExam && data.onScreen && typeof data.onScreen === 'object'
        ? { ...(data.onScreen as Record<string, unknown>), ...examOnScreen(liveExam) }
        : data.onScreen
    return JSON.stringify({ ...data, ...(learnerName ? { learner: learnerName } : {}), ...(data.onScreen ? { onScreen } : {}) })
  }, [data, exam, step, learnerName])
  useAgentContext({ description: CONTEXT_KEY, value })
  return null
}

function Header({ onClose, layout }: { onClose: () => void; layout: HanaLayout }) {
  const { reset, running, hasMessages } = useConversation(COURSE_HELP_AGENT_ID)
  const iconBtn =
    'inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand'
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-ui-line bg-ui-surface py-2 pe-1.5 ps-3.5">
      <HanaPortrait size={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14.5px] font-semibold tracking-[-0.01em]">Hana</span>
        <span className={cn('truncate text-xs', running ? 'font-medium text-ui-brand-text' : 'text-ui-muted')} aria-live="polite">
          {running ? 'Thinking' : 'Your course guide'}
        </span>
      </span>
      {hasMessages && (
        <button type="button" onClick={reset} className={iconBtn} aria-label="New chat" title="New chat">
          <SquarePen className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {layout.canDock && (
        <button
          type="button"
          onClick={layout.toggle}
          className={iconBtn}
          aria-label={layout.docked ? 'Float Hana over the page' : 'Dock Hana beside the lesson'}
          title={layout.docked ? 'Float' : 'Dock to the side'}
        >
          {layout.docked ? (
            <PictureInPicture2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          ) : (
            <PanelRight className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      )}
      <button type="button" onClick={onClose} className={iconBtn} aria-label="Close Hana" title="Close">
        <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
    </header>
  )
}

function makeWelcome(enrolled: boolean, step: HanaStep | null, learnerName: string | null) {
  const starters = startersFor(enrolled, step)
  const where = stepName(enrolled, step)
  return function CourseHanaWelcome({ input, className }: WelcomeScreenProps) {
    const { send, running } = useConversation(COURSE_HELP_AGENT_ID)
    return (
      <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="ai-welcome">
            <p className="text-[14.5px] font-semibold leading-snug">Hi{learnerName ? ` ${learnerName}` : ''}, I&rsquo;m Hana.</p>
            <p className="mt-1 text-[13.5px] leading-normal text-ui-muted">
              Ask me anything about {where ? <span className="font-medium text-ui-text">{where}</span> : 'this course'}. I&rsquo;ll help
              you understand it, and the answers are yours to find.
            </p>
          </div>
          <ul className="mt-3.5 flex flex-col gap-1.5">
            {starters.map((s, i) => (
              <li key={s.text} className="ai-starter" style={{ animationDelay: `${80 + i * 45}ms` }}>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void send(s.text)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-full border border-ui-brand/30 px-3 py-1.5 text-start text-[13px] font-medium text-ui-brand-text transition-colors hover:bg-ui-brand-soft disabled:opacity-60"
                >
                  <s.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0">{input}</div>
      </div>
    )
  }
}

export default function CourseHanaChat({ open, onClose, layout, courseId, enrolled, step, learnerName }: CourseHanaChatProps) {
  // The greeting follows the page ("Ask me anything about unit 3").
  const Welcome = useMemo(() => makeWelcome(enrolled, step, learnerName), [enrolled, step, learnerName])

  // Focus the composer on open, where there's a real keyboard.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !window.matchMedia('(pointer: fine)').matches) return
    const t = window.setTimeout(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(t)
  }, [open])

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <AdminCopilotSession
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-ui-muted" aria-busy="true">
            Connecting to Hana
          </div>
        }
      >
        <CoursePageContext courseId={courseId} step={step} learnerName={learnerName} />
        <HanaReplyActionsProvider reportSurface="course-help">
          <AdminChat
            agentId={COURSE_HELP_AGENT_ID}
            welcomeScreen={Welcome}
            placeholder="Ask Hana about this step"
            header={<Header onClose={onClose} layout={layout} />}
            className="admin-ai admin-ai--narrow course-hana-chat h-full flex-1 bg-ui-surface"
          />
        </HanaReplyActionsProvider>
      </AdminCopilotSession>
    </div>
  )
}
