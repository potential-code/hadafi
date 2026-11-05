'use client'

/**
 * Hadafi's AI Examiner: Hana plays a customer of the learner's own business
 * and puts one of her courses to the test (ported from SMEEP's SanaExaminer,
 * 7c7331f + 4744f93 + 21abecf). Runs on potential-ai's `smeepExaminer` graph,
 * which takes Hana's persona from the token's platform.
 *
 * Flow: pick an enrolled course and a mode (text, voice, video), Hana sets a
 * scene and plays the customer, three judged questions, then she steps out
 * of the role and calls record_assessment. That only ends the exam: the page
 * posts the exam's thread id to Hadafi's server, which has potential-ai mark
 * the transcript it holds, and shows and saves that result.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import '@copilotkit/react-ui/v2/styles.css'
import {
  CopilotChat,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
  UseAgentUpdate,
  ToolCallStatus,
  type CopilotChatInputProps,
} from '@copilotkit/react-core/v2'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ChevronRight, History, Loader2, MessageCircle, Mic, Video } from 'lucide-react'
import { btn, Chip, EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/kit'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { makeUuid, useStreamingVoice } from '@/components/dashboard/useStreamingVoice'
import { VoiceDock } from '@/components/dashboard/VoiceDock'
import {
  HanaAssistantMessage,
  HanaReplyActions,
  HanaTypingIndicator,
  HanaUserMessage,
  type HanaReplyActionsRenderer,
} from '@/components/dashboard/HanaMessages'
import { HanaChatInput, HanaComposerOptions } from '@/components/dashboard/HanaChatInput'
import { HanaReplyButtons, replyPlainText } from '@/components/dashboard/HanaReplyButtons'
import { ReportAnswerButton, excerptBefore } from '@/components/dashboard/ReportAnswerButton'
import { useReadAloud } from '@/components/dashboard/useHanaVoice'
import { useHanaRunError, HanaConnectionNotice } from '@/components/dashboard/HanaRunError'
import { ChatLoadingContext } from '@/components/dashboard/chat-loading-context'
import { AnamCall, type AnamClientLike } from './AnamCall'
import {
  bandOf,
  DIMENSION_LABELS,
  ExamCard,
  ExamCardSkeleton,
  MarkedScorecard,
  MarkingCard,
  ScorecardResultContext,
  WARN_STYLE,
  type Scorecard,
  type ScorecardResult,
} from './ExaminerCards'
import '@/components/dashboard/hana-studio.css'
import './examiner.css'

const AGENT_ID = 'smeepExaminer'
const START_MARKER = '[start-exam]'
const END_MARKER = '[end-exam]'
const QUESTIONS = 3

export type ExamMode = 'text' | 'voice' | 'video'

// Call discipline, as SMEEP (from the VX examiner):
/** Pieces of one spoken reply are merged when they land within this window. */
const SPEECH_MERGE_MS = 1500
/** The learner is mid-sentence: hold the pending pieces a little longer. */
const SPEECH_HOLD_MS = 4000
/** Voice calls never run past this. */
const MAX_VOICE_CALL_MS = 10 * 60_000
/** After the scorecard lands, give Hana a moment to close, then hang up. */
const HANG_UP_AFTER_CARD_MS = 2500

const MODE_LABEL: Record<string, string> = { text: 'Text', voice: 'Voice', video: 'Video' }

// ── Server data shapes ────────────────────────────────────────────────────────

interface ExaminableCourse {
  courseId: string
  title: string
  difficulty: string
  cover: string | null
  progressPercentage: number
}
interface ExamineeProfile {
  firstName: string
  fullName: string
  company: string | null
  country: string | null
  role: string
}
interface CourseReference {
  courseId: string
  title: string
  difficulty: string
  reference: string
}
interface AttemptRow {
  id: string
  courseId: string
  courseTitle: string
  mode: string
  scenario: string
  overallScore: number
  createdAt: string
}

// ── Thread pieces ─────────────────────────────────────────────────────────────

/** The page's hidden driver messages never show as learner bubbles. */
function ExaminerUserMessage(props: Parameters<typeof HanaUserMessage>[0]) {
  const raw = props.message?.content
  const text = typeof raw === 'string' ? raw : ''
  if (/^\s*\[(start-exam|end-exam|assess-transcript)\]/.test(text)) return null
  return <HanaUserMessage {...props} />
}

/** Once the exam is marked, replies would only confuse the scorecard: the composer closes. */
const ExamClosedContext = createContext<string | null>(null)

function ExaminerInput(props: CopilotChatInputProps) {
  const closed = useContext(ExamClosedContext)
  if (closed) {
    return (
      <div className="hx-closed px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
        <p className="mx-auto max-w-[776px] rounded-[12px] border border-ui-line bg-ui-surface px-4 py-3 text-[14px] text-ui-muted" role="status">
          {closed}
        </p>
      </div>
    )
  }
  return <HanaChatInput {...props} />
}

// ── The exam session (inside the CopilotKit provider) ────────────────────────

interface SessionProps {
  course: CourseReference
  profile: ExamineeProfile
  mode: ExamMode
  threadId: string
  onExit: () => void
  onSaved: () => void
}

function ExamSession({ course, profile, mode, threadId, onExit, onSaved }: SessionProps) {
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({
    agentId: AGENT_ID,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged, UseAgentUpdate.OnStateChanged],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG-UI AbstractAgent shape is loose
  const agentAny = agent as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(agent)
  useEffect(() => {
    agentRef.current = agent
  })
  const questionNumber: number = typeof agentAny?.state?.questionNumber === 'number' ? agentAny.state.questionNumber : 1
  const isRunning = Boolean(agentAny?.isRunning)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = agentAny?.messages ?? []
  const [scorecard, setScorecard] = useState<ScorecardResult>({ result: null, error: null })
  const [ended, setEnded] = useState(false)

  // What the agent reads: who it is testing, and its syllabus.
  useAgentContext({
    description: '__examiner_learner__',
    value: JSON.stringify({ firstName: profile.firstName, company: profile.company, role: profile.role, country: profile.country }),
  })
  useAgentContext({
    description: '__examiner_course__',
    value: JSON.stringify({ title: course.title, difficulty: course.difficulty, reference: course.reference }),
  })

  // Submissions are serialised: concurrent runAgent calls drop replies.
  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      runChainRef.current = runChainRef.current.then(async () => {
        const liveAgent = agentRef.current
        try {
          liveAgent.addMessage({ id: makeUuid(), role: 'user', content: text })
          await copilotkit.runAgent({ agent: liveAgent })
        } catch (err) {
          console.warn('[examiner] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  const [runFailed, setRunFailed] = useHanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  // ── Calls (voice and video) ────────────────────────────────────────────────

  // Spoken replies arrive in pieces: merge them into one turn, and never send
  // while Hana is still answering (flushed again when her run ends).
  const heardRef = useRef<string[]>([])
  const mergeTimerRef = useRef<number | undefined>(undefined)
  const flushHeard = useCallback(() => {
    mergeTimerRef.current = undefined
    if (agentRef.current?.isRunning || !heardRef.current.length) return
    const text = heardRef.current.join(' ')
    heardRef.current = []
    sendMessage(text)
  }, [sendMessage])
  const onLearnerSpeech = useCallback(
    (text: string) => {
      heardRef.current.push(text)
      window.clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = window.setTimeout(flushHeard, SPEECH_MERGE_MS)
    },
    [flushHeard],
  )
  const onLearnerTalking = useCallback(() => {
    if (!heardRef.current.length) return
    window.clearTimeout(mergeTimerRef.current)
    mergeTimerRef.current = window.setTimeout(flushHeard, SPEECH_HOLD_MS)
  }, [flushHeard])
  useEffect(() => {
    if (isRunning || !heardRef.current.length || mergeTimerRef.current !== undefined) return
    flushHeard()
  }, [isRunning, flushHeard])
  useEffect(() => () => window.clearTimeout(mergeTimerRef.current), [])

  // Voice: Hadafi's streaming-voice stack (live speech to text with the
  // /api/account/voice-token, Hana's voice, half-duplex, barge-in). It speaks
  // each new reply itself; finished utterances go through the merge above.
  const voice = useStreamingVoice({
    agent,
    submit: onLearnerSpeech,
    onInterrupt: () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(copilotkit as any).stopAgent?.({ agent: agentRef.current })
      } catch {
        /* no active run */
      }
    },
  })
  const { startVoice, stopVoice } = voice
  useEffect(() => {
    if (mode !== 'voice') return
    startVoice()
    const cap = window.setTimeout(stopVoice, MAX_VOICE_CALL_MS)
    return () => {
      window.clearTimeout(cap)
      stopVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Video: Anam renders the face and voice; the graph's new lines are spoken
  // with talk(). Only the newest fresh line, once her run ends, so a closing
  // line and the scorecard never queue up old lines.
  const avatarRef = useRef<AnamClientLike | null>(null)
  const [avatarLive, setAvatarLive] = useState(false)
  const spokenRef = useRef(new Set<string>())
  const spokenLines = useCallback(
    () =>
      messages.filter(
        (m) => m.role === 'assistant' && !(m.toolCalls?.length > 0) && typeof m.content === 'string' && m.content.trim(),
      ),
    [messages],
  )
  const [pendingSpeech, setPendingSpeech] = useState(false)
  useEffect(() => {
    if (mode !== 'video' || !avatarLive) return
    const said = spokenLines()
    if (isRunning) {
      setPendingSpeech(said.some((m) => !spokenRef.current.has(m.id)))
      return
    }
    const fresh = said.filter((m) => !spokenRef.current.has(m.id))
    said.forEach((m) => spokenRef.current.add(m.id))
    setPendingSpeech(false)
    const line = fresh[fresh.length - 1]
    if (line) void avatarRef.current?.talk(String(line.content).trim()).catch(() => undefined)
  }, [mode, avatarLive, isRunning, spokenLines])

  const callLive = mode === 'video' ? avatarLive : mode === 'voice' ? voice.callStartedAt !== null : true

  // ── Frontend tools (registered before the kick-off below) ────────────────

  useFrontendTool({
    name: 'set_scene',
    description: 'Open the scene card for the role-play: a short title and a one-sentence setting.',
    parameters: z.object({ title: z.string(), setting: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <ExamCardSkeleton />
      return (
        <ExamCard title={String(args?.title ?? 'The scene')} kind="The scene" latest={false} className="!mb-1">
          <p className="text-[14px] leading-relaxed text-ui-text" dir="auto">{String(args?.setting ?? '')}</p>
        </ExamCard>
      )
    },
    handler: async () => 'Scene set. Now speak your opening line as the customer.',
  })

  const courseIdRef = useRef(course.courseId)
  useEffect(() => {
    courseIdRef.current = course.courseId
  })
  useFrontendTool({
    name: 'record_assessment',
    description: "The examiner's scorecard at the end of the role-play. It ends the exam; Hadafi marks it on its server.",
    parameters: z.object({
      scenario: z.string().describe('A short name for the scenario that was played'),
      overallScore: z.number().int().min(0).max(100),
      dimensions: z.object({
        courseKnowledge: z.number().int().min(0).max(100),
        application: z.number().int().min(0).max(100),
        communication: z.number().int().min(0).max(100),
        problemSolving: z.number().int().min(0).max(100),
        professionalism: z.number().int().min(0).max(100),
      }),
      strengths: z.array(z.string()).min(1).max(6),
      improvements: z.array(z.string()).min(1).max(6),
      feedback: z.string(),
    }),
    followUp: false,
    render: ({ status }) => (status === ToolCallStatus.InProgress ? <MarkingCard /> : <MarkedScorecard courseTitle={course.title} />),
    handler: async (args) => {
      setEnded(true)
      try {
        const { data } = await apiFetch<{ data: Scorecard }>('/api/ai/examiner/attempts', {
          method: 'POST',
          // The exam's thread, never its transcript or score: Hadafi's server
          // has potential-ai mark the transcript it holds for this learner.
          body: JSON.stringify({ courseId: courseIdRef.current, mode, scenario: args.scenario, threadId }),
        })
        setScorecard({ result: data, error: null })
        onSaved()
      } catch (err) {
        console.warn('[examiner] marking the attempt failed', err)
        setScorecard({
          result: null,
          error:
            (err as { error?: { message?: string } } | null)?.error?.message ??
            "Your exam couldn't be marked right now. Please try again in a moment.",
        })
      }
      return 'Scorecard recorded.'
    },
  })

  // Kick the exam off once per thread, and on a call only once it is up so
  // Hana's opening line has a listener. Declared after the tools (effects
  // run in order, so the first run carries them); waits for the runtime to
  // connect (polled: the status isn't reactive); latches only when the send
  // fires (StrictMode mounts twice).
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current || !callLive) return
    let kick: ReturnType<typeof setTimeout> | undefined
    const timer = window.setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = copilotkit as any
      if (startedRef.current || core.runtimeConnectionStatus !== 'connected') return
      window.clearInterval(timer)
      kick = setTimeout(() => {
        if (startedRef.current) return
        startedRef.current = true
        sendMessage(`${START_MARKER} Begin the exam.`)
      }, 50)
    }, 150)
    return () => {
      window.clearInterval(timer)
      if (kick) clearTimeout(kick)
    }
  }, [copilotkit, sendMessage, callLive])

  // Voice: once the scorecard is on screen, give Hana a moment, then hang up.
  useEffect(() => {
    if (mode !== 'voice' || !ended) return
    const t = window.setTimeout(stopVoice, HANG_UP_AFTER_CARD_MS)
    return () => window.clearTimeout(t)
  }, [mode, ended, stopVoice])

  const endExam = useCallback(() => sendMessage(`${END_MARKER} End the exam and assess me.`), [sendMessage])

  // Copy, read aloud and "report this answer" under Hana's replies.
  const readAloud = useReadAloud()
  const renderReplyActions = useCallback<HanaReplyActionsRenderer>(
    ({ before, ...reply }) => (
      <>
        <HanaReplyButtons {...reply} readAloud={readAloud} />
        <ReportAnswerButton
          surface="examiner"
          reply={replyPlainText(reply.text)}
          question={[...(before ?? [])].reverse().find((t) => t.role === 'learner')?.text}
          excerpt={excerptBefore(before ?? [])}
          conversation={threadId}
        />
      </>
    ),
    [readAloud, threadId],
  )
  const composerOptions = useMemo(() => ({ placeholder: 'Reply as you would at work' }), [])

  return (
    <ChatLoadingContext.Provider value={isRunning}>
      <div className="hana-studio hadafi-copilot relative flex min-h-0 flex-1 flex-col overflow-hidden bg-ui-bg">
        {runFailed && <HanaConnectionNotice onRetry={retryRun} />}

        <header className="relative z-[3] flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to exam setup"
            title="Back to exam setup"
            className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0')}
          >
            <ArrowLeft className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
          </button>
          <div className="flex min-w-0 flex-1 basis-[180px] flex-col">
            <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">AI Examiner</h1>
            <p className="truncate text-[13px] text-ui-muted">
              {course.title}, {MODE_LABEL[mode]!.toLowerCase()} exam
            </p>
          </div>
          <div className="flex items-center gap-2.5" aria-live="polite">
            {!ended && (
              <span className="hidden items-center gap-2 text-[13px] font-medium text-ui-muted sm:inline-flex">
                Question {Math.min(questionNumber, QUESTIONS)} of {QUESTIONS}
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: QUESTIONS }).map((_, i) => (
                    <span
                      key={i}
                      className={cn('h-1.5 w-5 rounded-full', i < Math.min(questionNumber, QUESTIONS) ? 'bg-ui-brand' : 'bg-ui-surface-2')}
                    />
                  ))}
                </span>
              </span>
            )}
            {!ended ? (
              <button type="button" onClick={endExam} className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 px-3.5')}>
                End and get feedback
              </button>
            ) : (
              <button type="button" onClick={onExit} className={cn(btn({ variant: 'primary', size: 'md' }), 'h-9 px-3.5')}>
                Try another scenario
                <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              </button>
            )}
          </div>
        </header>

        {mode === 'video' && (
          <AnamCall
            clientRef={avatarRef}
            onLive={setAvatarLive}
            onLearnerSpeech={onLearnerSpeech}
            onLearnerTalking={onLearnerTalking}
            examOver={ended}
            thinking={isRunning || pendingSpeech}
            onExit={onExit}
          />
        )}
        {mode === 'voice' && voice.voiceOn && (
          <VoiceDock
            state={voice.voiceState}
            callStartedAt={voice.callStartedAt}
            isMuted={voice.isMuted}
            caption={voice.caption}
            agentName="Hana"
            onMute={voice.toggleMute}
            onHangup={voice.stopVoice}
          />
        )}
        <audio ref={voice.audioRef} hidden />

        <ScorecardResultContext.Provider value={scorecard}>
          <ExamClosedContext.Provider value={ended ? 'This exam is over. Use “Try another scenario” to practise again.' : null}>
            <HanaComposerOptions.Provider value={composerOptions}>
              <HanaReplyActions.Provider value={renderReplyActions}>
                <div className="hadafi-assistant-chat hadafi-examiner-chat relative z-[1] min-h-0 flex-1 overflow-hidden">
                  <CopilotChat
                    agentId={AGENT_ID}
                    threadId={threadId}
                    messageView={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      assistantMessage: HanaAssistantMessage as any,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      userMessage: ExaminerUserMessage as any,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      cursor: HanaTypingIndicator as any,
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    input={ExaminerInput as any}
                    labels={{ chatInputPlaceholder: 'Reply as you would at work' }}
                  />
                </div>
              </HanaReplyActions.Provider>
            </HanaComposerOptions.Provider>
          </ExamClosedContext.Provider>
        </ScorecardResultContext.Provider>
      </div>
    </ChatLoadingContext.Provider>
  )
}

// ── Start screen ──────────────────────────────────────────────────────────────

const MODES: Array<{ key: ExamMode; label: string; hint: string; icon: typeof Mic }> = [
  { key: 'text', label: 'Text', hint: 'Type your replies', icon: MessageCircle },
  { key: 'voice', label: 'Voice', hint: 'A live spoken conversation', icon: Mic },
  { key: 'video', label: 'Video', hint: 'Face to face with Hana', icon: Video },
]

const MODE_NOTE: Record<ExamMode, string> = {
  text: 'Three questions, about ten minutes. You can end the exam at any time.',
  voice: 'Voice exams end after 10 minutes. Allow your microphone when asked.',
  video: 'Video exams end after 6 minutes. Allow your camera and microphone when asked.',
}

const HOW_IT_WORKS = [
  { title: 'Hana sets a scene', body: 'She plays a real customer of your business.' },
  { title: 'Three real questions', body: 'You answer as you would at work.' },
  { title: 'Score and feedback', body: 'A score out of 100, marked against the course.' },
]

interface StartProps {
  courses: ExaminableCourse[]
  coursesLoaded: boolean
  attempts: AttemptRow[]
  attemptsLoaded: boolean
  profile: ExamineeProfile | null
  starting: boolean
  startError: string | null
  onStart: (courseId: string, mode: ExamMode) => void
}

function StartScreen({ courses, coursesLoaded, attempts, attemptsLoaded, profile, starting, startError, onStart }: StartProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [mode, setMode] = useState<ExamMode>('text')
  const courseId = picked ?? courses[0]?.courseId ?? null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-ui-bg text-sm text-ui-text">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-[22px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <PageHeader
          className="mb-0"
          title="AI Examiner"
          subtitle={
            <>
              Hana plays a customer of{' '}
              {profile?.company ? <b className="font-semibold text-ui-text">{profile.company}</b> : 'your business'} and puts a course to
              the test: three questions, then a score out of 100 with honest feedback.
            </>
          }
        />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form
            className="flex min-w-0 flex-col gap-[22px] rounded-[14px] border border-ui-line bg-ui-surface p-5 sm:p-[22px]"
            aria-labelledby="ex-setup"
            onSubmit={(e) => {
              e.preventDefault()
              if (courseId) onStart(courseId, mode)
            }}
          >
            <h2 id="ex-setup" className="text-[17px] font-semibold text-ui-text">Set up a practice exam</h2>

            <fieldset className="flex min-w-0 flex-col gap-2.5">
              <legend className="pb-2.5 text-sm font-semibold text-ui-text">Which course should Hana test you on?</legend>
              {!coursesLoaded ? (
                <>
                  <Skeleton className="h-[68px] rounded-[12px]" />
                  <Skeleton className="h-[68px] rounded-[12px]" />
                </>
              ) : courses.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-ui-line">
                  <EmptyState
                    icon={BookOpen}
                    title="Start with a course"
                    body="Enroll in a course, then come back and let Hana test you on it."
                    action={
                      <Link href="/dashboard/courses" className={btn({ variant: 'secondary', size: 'md' })}>
                        Browse courses
                      </Link>
                    }
                  />
                </div>
              ) : (
                courses.map((c) => {
                  const sel = c.courseId === courseId
                  const pct = Math.max(0, Math.min(100, Math.round(c.progressPercentage)))
                  return (
                    <label
                      key={c.courseId}
                      className={cn(
                        'grid cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-3 rounded-[12px] border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-brand',
                        sel ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
                      )}
                    >
                      <input
                        type="radio"
                        name="exam-course"
                        className="mt-0.5 h-[18px] w-[18px] accent-[var(--ui-brand)] focus-visible:outline-none"
                        checked={sel}
                        onChange={() => setPicked(c.courseId)}
                      />
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="flex justify-between gap-3">
                          <span className="min-w-0 font-semibold text-ui-text">{c.title}</span>
                          <span className="flex-none text-[13px] tabular-nums text-ui-muted">{pct}%</span>
                        </span>
                        <ProgressBar value={pct} label={`${c.title}: ${pct}% studied`} className={sel ? 'bg-ui-surface' : undefined} />
                      </span>
                    </label>
                  )
                })
              )}
            </fieldset>

            <fieldset className="flex min-w-0 flex-col gap-2.5">
              <legend className="pb-2.5 text-sm font-semibold text-ui-text">How do you want to take it?</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-3">
                {MODES.map(({ key, label, hint, icon: Icon }) => {
                  const sel = key === mode
                  return (
                    <label
                      key={key}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-[12px] border p-4 transition-colors sm:flex-col sm:gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-brand',
                        sel ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
                      )}
                    >
                      <input type="radio" name="exam-mode" className="sr-only" checked={sel} onChange={() => setMode(key)} />
                      <span
                        className={cn(
                          'inline-flex h-10 w-10 flex-none items-center justify-center rounded-[10px]',
                          sel ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-text',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold text-ui-text">{label}</span>
                        <span className="text-[13px] text-ui-muted">{hint}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3.5 border-t border-ui-line pt-[18px]">
              <button
                type="submit"
                className={cn(btn({ variant: 'primary', size: 'lg' }), 'h-11 px-[22px]')}
                disabled={!courseId || starting || courses.length === 0}
              >
                {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {starting ? 'Preparing your exam' : 'Start exam'}
              </button>
              <span className="text-[13px] text-ui-muted">{MODE_NOTE[mode]}</span>
              {startError && (
                <p className="w-full text-[13px] text-ui-danger" role="alert">
                  {startError}
                </p>
              )}
            </div>
          </form>

          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-how">
              <h2 id="ex-how" className="text-base font-semibold text-ui-text">How it works</h2>
              <ol className="flex flex-col gap-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold',
                        i === 0 ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-text',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ui-text">{step.title}</span>
                      <span className="text-[13px] text-ui-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-scored">
              <h2 id="ex-scored" className="text-base font-semibold text-ui-text">What you&rsquo;re scored on</h2>
              <ul className="flex flex-wrap gap-1.5">
                {Object.values(DIMENSION_LABELS).map((label) => (
                  <li key={label} className="inline-flex h-7 items-center rounded-full bg-ui-surface-2 px-2.5 text-[13px] font-medium text-ui-text">
                    {label}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-relaxed text-ui-muted">
                80 and above is Excellent, 60 and above is Good. Below that, Hana tells you what to practise. Score 70 or more to earn the
                Real-world ready badge.
              </p>
            </section>
          </div>
        </div>

        <PastAttempts attempts={attempts} loaded={attemptsLoaded} />
      </div>
    </div>
  )
}

function PastAttempts({ attempts, loaded }: { attempts: AttemptRow[]; loaded: boolean }) {
  if (loaded && attempts.length === 0) {
    return (
      <section className="flex flex-wrap items-center gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-past">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-ui-surface-2 text-ui-muted">
          <History className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="ex-past" className="text-base font-semibold text-ui-text">Past attempts</h2>
          <p className="text-sm text-ui-muted">Your scorecards will be kept here after your first practice exam.</p>
        </div>
      </section>
    )
  }
  return (
    <section className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface" aria-labelledby="ex-past">
      <div className="flex items-center justify-between gap-3 border-b border-ui-line px-5 py-4">
        <h2 id="ex-past" className="text-base font-semibold text-ui-text">Past attempts</h2>
        {loaded && <span className="text-[13px] text-ui-muted">Your latest {attempts.length}</span>}
      </div>
      {!loaded ? (
        <div className="flex flex-col gap-2 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <ul>
          {attempts.map((a) => {
            const band = bandOf(a.overallScore)
            return (
              <li
                key={a.id}
                className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-ui-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[52px_minmax(0,1fr)_auto_auto]"
              >
                <span className="text-xl font-semibold tabular-nums text-ui-text">
                  {a.overallScore}
                  <span className="text-xs font-medium text-ui-muted">/100</span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ui-text">{a.courseTitle}</span>
                  <span className="truncate text-[13px] text-ui-muted">
                    {`${MODE_LABEL[a.mode] ?? a.mode} exam`}
                    {a.scenario ? ` · ${a.scenario}` : ''}
                  </span>
                </span>
                {band.tone === 'good' ? (
                  <Chip tone="ok">{band.label}</Chip>
                ) : (
                  <span className="inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold" style={WARN_STYLE}>
                    {band.label}
                  </span>
                )}
                <span className="hidden text-[13px] tabular-nums text-ui-muted sm:block">
                  {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function HanaExaminer() {
  const [courses, setCourses] = useState<ExaminableCourse[]>([])
  const [coursesLoaded, setCoursesLoaded] = useState(false)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [attemptsLoaded, setAttemptsLoaded] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ExamineeProfile | null>(null)
  const [starting, setStarting] = useState(false)
  const [session, setSession] = useState<{ course: CourseReference; threadId: string; mode: ExamMode } | null>(null)

  const refreshAttempts = useCallback(() => {
    apiFetch<{ data: AttemptRow[] }>('/api/ai/examiner/attempts?limit=6')
      .then((r) => setAttempts(r.data))
      .catch(() => {})
      .finally(() => setAttemptsLoaded(true))
  }, [])

  useEffect(() => {
    apiFetch<{ data: ExaminableCourse[] }>('/api/ai/examiner/courses')
      .then((r) => setCourses(r.data))
      .catch(() => {})
      .finally(() => setCoursesLoaded(true))
    apiFetch<{ data: ExamineeProfile }>('/api/ai/examiner/profile')
      .then((r) => setProfile(r.data))
      .catch(() => {})
    refreshAttempts()
  }, [refreshAttempts])

  const startExam = useCallback(async (courseId: string, mode: ExamMode) => {
    setStarting(true)
    setStartError(null)
    try {
      const { data } = await apiFetch<{ data: CourseReference }>(`/api/ai/examiner/courses/${courseId}/reference`)
      setSession({ course: data, threadId: makeUuid(), mode })
    } catch (err) {
      console.warn('[examiner] could not prepare the exam', err)
      setStartError('The exam could not be prepared. Please try again.')
    } finally {
      setStarting(false)
    }
  }, [])

  const profileOrDefault = useMemo<ExamineeProfile>(
    () => profile ?? { firstName: 'there', fullName: '', company: null, country: null, role: 'Entrepreneur' },
    [profile],
  )

  if (session) {
    return (
      <ExamSession
        key={session.threadId}
        course={session.course}
        profile={profileOrDefault}
        mode={session.mode}
        threadId={session.threadId}
        onExit={() => setSession(null)}
        onSaved={refreshAttempts}
      />
    )
  }

  return (
    <StartScreen
      courses={courses}
      coursesLoaded={coursesLoaded}
      attempts={attempts}
      attemptsLoaded={attemptsLoaded}
      profile={profile}
      starting={starting}
      startError={startError}
      onStart={startExam}
    />
  )
}
