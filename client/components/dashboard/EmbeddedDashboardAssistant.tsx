'use client'

import { useState, useRef, useCallback, useEffect, useId, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { z } from 'zod'
import {
  CopilotChat,
  ToolCallStatus,
  UseAgentUpdate,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
  useHumanInTheLoop,
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import './copilot.css'
import { useRouter, usePathname } from 'next/navigation'
import { Ban, Check, Download, FileText, MessageSquarePlus } from 'lucide-react'
import { btn, inputClass } from '@/components/kit'
import { COPILOT_AGENT } from './copilotConfig'
import { useSharedAssistantThreadId, useResetAssistantThread } from './AssistantProvider'
import { makeUuid, useStreamingVoice } from './useStreamingVoice'
import { VoiceDock, VoiceModeButton } from './VoiceDock'
import { getUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { getSmeSessions, getMentors } from '@/lib/api/sme'
import { fetchLearnerCourses, fetchUserCertificates, type CertificateWithCourse } from '@/lib/api/lms'
import { fetchMyEvents } from '@/lib/api/liveEvents'
import { fetchOffers } from '@/lib/api/offers'
import { getAllAiMentors } from '@/lib/dashboardData'
import { getCountryDataList } from 'countries-list'
import { PhoneField } from '@/components/ui/PhoneField'
import { onPillClickRef, beforeSendRef } from './chat-components'
import {
  HANA_AVATAR_SRC,
  HanaAssistantMessage,
  HanaReplyActions,
  HanaTypingIndicator,
  HanaUserMessage,
  type HanaReplyActionsRenderer,
} from './HanaMessages'
import { HanaChatInput, HanaComposerOptions } from './HanaChatInput'
import { HanaReplyButtons, replyPlainText } from './HanaReplyButtons'
import { ReportAnswerButton, excerptBefore } from './ReportAnswerButton'
import { useHanaRunError, HanaConnectionNotice } from './HanaRunError'
import { useReadAloud } from './useHanaVoice'
import { AskHanaGreeting, AskHanaShortcuts, AskHanaStarters, ASK_HANA_PENDING_KEY, ASK_STRINGS } from './AskHanaParts'
import { hanaAttachOptions, splitSharedDocument } from './hanaDocuments'
import './hana-studio.css'
import { cn } from '@/lib/utils'
import { CourseAssistantCards } from '@/components/dashboard/assistant-cards/CourseAssistantCards'
import { OfferAssistantCards } from '@/components/dashboard/assistant-cards/OfferAssistantCards'
import { HumanMentorAssistantCards } from '@/components/dashboard/assistant-cards/HumanMentorAssistantCards'
import { AiMentorAssistantCards } from '@/components/dashboard/assistant-cards/AiMentorAssistantCards'
import { AiToolAssistantCards } from '@/components/dashboard/assistant-cards/AiToolAssistantCards'
import { SessionAssistantCards } from '@/components/dashboard/assistant-cards/SessionAssistantCards'
import { EventAssistantCards } from '@/components/dashboard/assistant-cards/EventAssistantCards'
import { filterCourses, filterOffers } from '@/components/dashboard/assistant-cards/filterUtils'
import { MentorBookingWidget } from '@/components/dashboard/assistant-cards/MentorBookingWidget'
import { AssistantCardSkeleton } from '@/components/dashboard/assistant-cards/AssistantCardStrip'

const VALID_COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

import { ChatLoadingContext } from './chat-loading-context'
import { useNarrow } from './useNarrow'
import { ASK_HANA_PROMPT as ASSISTANT_INSTRUCTIONS } from '../../../shared/hana/prompts'

// Toggle: set to true to re-enable page-navigation actions (openXxxAndGetData).
// When false, the LLM never sees these actions — all content queries go through
// the card-display actions (showXxxCards) instead.
const NAVIGATION_ACTIONS_ENABLED = false

// ─── User snapshot type ───────────────────────────────────────────────────────

type UserSnapshot = {
  certificates: { title: string; number: string }[]
  enrolledCourses: { title: string; progress: string; difficulty: string }[]
  upcomingSessions: { mentor: string | null; date: string | null }[]
  pointsBalance: number
  offersCount: number
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/profile': 'Profile',
  '/dashboard/sessions': 'Sessions',
  '/dashboard/courses': 'Courses',
  '/dashboard/events': 'Events',
  '/dashboard/offers': 'Offers',
  '/dashboard/human-mentors': 'Human Mentors',
  '/dashboard/ai-mentors': 'AI Mentors',
  '/dashboard/support': 'Support',
  '/dashboard/assistant': 'Ask Hana',
}

// v2 tool results arrive as strings (the respond() payload is JSON-serialized
// into the tool message). Parse back into the original outcome object.
function parseToolOutcome<T>(result: unknown): T | null {
  if (result == null) return null
  if (typeof result === 'object') return result as T
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as T
    } catch {
      return null
    }
  }
  return null
}

// Fires respond() immediately when mentorName is empty (partial arg streaming).
// Keeps the HITL stream unblocked without rendering anything visible.
function EmptyMentorNameGuard({ respond }: { respond?: (r: unknown) => void }) {
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current || !respond) return
    firedRef.current = true
    respond({ error: 'no_mentor_name' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// Silently auto-cancels a redundant bookMentorSession invocation triggered by the LLM
// after a user-initiated cancellation. The `suppressed` flag signals the complete-state
// renderer to hide the card so no second "Booking not completed" appears.
function CancelledBookingGuard({ respond }: { respond?: (r: unknown) => void }) {
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current || !respond) return
    firedRef.current = true
    respond({ cancelled: true, suppressed: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** The server's own words for a failed request, or a plain fallback. */
function errorMessage(err: unknown, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any
  const msg = e?.error?.message ?? (typeof e?.error === 'string' ? e.error : undefined) ?? e?.message
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}

// ─── Field update card (collect + save a single profile field in one step) ────

type CollectableField = 'fullName' | 'company' | 'country' | 'bio' | 'phone'

const FIELD_TITLES: Record<CollectableField, string> = {
  fullName: 'Full name',
  company: 'Company',
  country: 'Country',
  bio: 'Bio',
  phone: 'Phone',
}

// The card after save or cancel: one quiet status line instead of the form.
function FieldUpdateOutcome({ field, result }: { field: CollectableField; result: unknown }) {
  const outcome = parseToolOutcome<{ saved?: boolean; cancelled?: boolean }>(result) ?? {}
  const label = FIELD_TITLES[field] ?? 'Profile'
  const text = outcome.saved ? `${label} updated` : outcome.cancelled ? `${label} update cancelled` : `${label} wasn't updated`
  return (
    <div className="my-2 flex">
      <span
        role="status"
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium',
          outcome.saved ? 'border-transparent bg-ui-ok-soft text-ui-ok' : 'border-ui-line bg-ui-surface text-ui-muted',
        )}
      >
        {outcome.saved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Ban className="h-3.5 w-3.5" aria-hidden />}
        {text}
      </span>
    </div>
  )
}

function FieldUpdateCard({
  field,
  onSave,
  onCancel,
  onRegisterCancel,
  onDone,
}: {
  field: CollectableField
  onSave: (value: string) => Promise<true | string>
  onCancel: () => void
  onRegisterCancel: (fn: () => void) => void
  onDone: () => void
}) {
  const [value, setValue] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'cancelled'>('idle')

  const done = status !== 'idle' && status !== 'saving'
  const busy = status === 'saving'
  const didRegisterRef = useRef(false)

  useEffect(() => {
    // Guard against React StrictMode's double-invocation of effects on mount.
    // Without this, the second run finds cancelCurrentCardRef already set to this
    // card's own cancel function and immediately self-cancels.
    if (didRegisterRef.current) return
    didRegisterRef.current = true
    onRegisterCancel(() => {
      setStatus('cancelled')
      onDone()
      onCancel()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validate(v: string): string {
    if (field === 'phone') {
      const trimmed = v.trim()
      if (!trimmed.startsWith('+') || !/\+\d[\d\s()-]*\s+\S+/.test(trimmed))
        return 'Include a country code, e.g. "+44 7700900123" or "+1 2025551234"'
    }
    if (field === 'country' && v && !VALID_COUNTRIES.includes(v))
      return 'Please select a country from the list.'
    if (field === 'fullName' && v.trim().length < 2)
      return 'Name must be at least 2 characters.'
    if (field === 'bio' && v.length > 500)
      return 'Bio must be 500 characters or fewer.'
    if (!v.trim())
      return 'This field cannot be empty.'
    return ''
  }

  async function handleSave() {
    const err = validate(value)
    if (err) { setErrorMsg(err); return }
    setStatus('saving')
    const result = await onSave(field === 'phone' ? value : value.trim())
    setStatus(result === true ? 'saved' : 'error')
    if (result !== true) {
      setErrorMsg(result)
      return
    }
    onDone()
  }

  function handleCancel() {
    setStatus('cancelled')
    onDone()
    onCancel()
  }

  return (
    <div className="mb-4 max-w-md rounded-[14px] border border-ui-line bg-ui-surface p-4 text-sm shadow-ui">
      <p className="mb-3 text-[15px] font-semibold text-ui-text">Update {FIELD_TITLES[field]}</p>

      {status === 'saved' && (
        <p className="mb-2 text-[13px] font-medium text-ui-ok" role="status">Saved.</p>
      )}
      {status === 'cancelled' && (
        <p className="mb-2 text-[13px] text-ui-muted" role="status">Update cancelled.</p>
      )}

      {field === 'phone' && (
        <PhoneField
          value={value}
          onChange={(v) => { setValue(v); setErrorMsg('') }}
          disabled={done || busy}
        />
      )}

      {field === 'country' && (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => { setValue(e.target.value); setErrorMsg('') }}
            disabled={done || busy}
            aria-label={FIELD_TITLES[field]}
            className={cn(inputClass, 'appearance-none pe-8 cursor-pointer disabled:cursor-default')}
          >
            <option value="">Select country…</option>
            {VALID_COUNTRIES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-muted" aria-hidden viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {field === 'bio' && (
        <div>
          <textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); setErrorMsg('') }}
            rows={4}
            maxLength={500}
            disabled={done || busy}
            placeholder="Tell us about yourself…"
            aria-label={FIELD_TITLES[field]}
            className={cn(inputClass, 'h-auto resize-none py-2.5')}
          />
          <p className="mt-1 text-end text-xs text-ui-muted">{value.length}/500</p>
        </div>
      )}

      {(field === 'fullName' || field === 'company') && (
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErrorMsg('') }}
          disabled={done || busy}
          placeholder={field === 'fullName' ? 'Your full name' : 'Your company name'}
          aria-label={FIELD_TITLES[field]}
          className={inputClass}
        />
      )}

      {errorMsg && <p className="mt-2 text-[13px] text-ui-danger" role="alert">{errorMsg}</p>}

      {!done && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className={cn(btn({ variant: 'primary', size: 'sm' }), 'h-9 flex-1')}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9 flex-1')}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Document delivery card (PDF send confirmation) ──────────────────────────

function DocumentDeliveryCard({
  documentType,
  title,
  content,
  defaultEmail,
}: {
  documentType: string
  title: string
  content?: string
  defaultEmail: string
}) {
  // The server always sends to the account's own address; show it, don't ask for it.
  const [email, setEmail] = useState(defaultEmail)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Content arrives via streaming tool-argument chunks. Disable Send until
  // content stops changing for 600ms so we never send a partial document.
  const [contentReady, setContentReady] = useState(false)
  useEffect(() => {
    setContentReady(false)
    const t = setTimeout(() => setContentReady(true), 600)
    return () => clearTimeout(t)
  }, [content])

  const TYPE_LABELS: Record<string, string> = {
    'business-ideas': 'Business Ideas',
    'business-plan': 'Business Plan',
    'marketing-plan': 'Marketing Plan',
    'product-proposal': 'Sales Proposal',
  }
  const label = TYPE_LABELS[documentType] ?? 'Document'

  async function handleSend() {
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await apiFetch<{ email?: string }>('/api/ai-tools/generate-pdf', {
        method: 'POST',
        body: JSON.stringify({ documentType, title, content }),
      })
      if (res?.email) setEmail(res.email)
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setErrorMsg(errorMessage(err, 'The PDF could not be sent. Please try again.'))
    }
  }

  return (
    <div className="mb-4 max-w-md rounded-[14px] border border-ui-line bg-ui-surface p-4 text-sm shadow-ui">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-ui-text">{label} ready</p>
          {title && <p className="truncate text-[13px] text-ui-muted">{title}</p>}
        </div>
      </div>

      {content && (
        <div className="mb-3">
          <p className="mb-1.5 text-[13px] font-semibold text-ui-muted">Document preview</p>
          <div
            className="hadafi-doc-preview overflow-y-auto rounded-[10px] border border-ui-line bg-ui-surface-2 px-3 py-2 text-[13px] leading-relaxed text-ui-text"
            style={{ maxHeight: '200px' }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}

      {status === 'sent' ? (
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ui-ok" role="status">
          <Check size={15} strokeWidth={2.5} aria-hidden />
          PDF sent to {email}
        </div>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ui-muted">
            {email ? (
              <>We&apos;ll email the PDF to <span className="font-medium text-ui-text">{email}</span>.</>
            ) : (
              'We\'ll email the PDF to your account\'s address.'
            )}
          </p>
          {errorMsg && <p className="mb-2 text-[13px] text-ui-danger" role="alert">{errorMsg}</p>}
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'sending' || !contentReady}
            className={cn(btn({ variant: 'primary', size: 'sm' }), 'h-9 w-full')}
          >
            {status === 'sending' ? 'Sending…' : !contentReady ? 'Preparing document…' : 'Send PDF'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Embedded dashboard assistant ────────────────────────────────────────────

// Stable no-op input component — passed to CopilotChat while the greeting
// overlay is visible so the underlying input bar stays hidden.
const NullInput = () => null

// Card CTAs (e.g. the AI tool cards' Start button) reach sendMessage through this
// module-level ref. useFrontendTool registers each tool's render closure ONCE, on
// the first render — before the CopilotKit runtime has connected, while useAgent
// still returns a provisional agent with an empty message list. A render closure
// that captures sendMessage directly is therefore frozen to that empty agent:
// clicks would post a single-message thread, which the LangGraph adapter misreads
// as a regenerate request and fails with "Message not found". Reading through the
// ref at click time always reaches the live agent (same pattern as onPillClickRef).
const onToolStartRef: { current: ((msg: string) => void) | null } = { current: null }

// A question typed into Home's "Ask Hana" bar arrives here through
// sessionStorage. It is read and removed on first load (used once), and kept
// in this module variable until it has been sent, so React StrictMode's
// throwaway first mount can't lose it.
let pendingAsk: string | null = null
function takePendingAsk(): string | null {
  try {
    const v = sessionStorage.getItem(ASK_HANA_PENDING_KEY)
    if (v !== null) {
      sessionStorage.removeItem(ASK_HANA_PENDING_KEY)
      pendingAsk = v.trim() || null
    }
  } catch {
    /* storage blocked: behave as a normal visit */
  }
  return pendingAsk
}

export function EmbeddedDashboardAssistant({ className }: { className?: string } = {}) {
  const [userSnapshot, setUserSnapshot] = useState<UserSnapshot | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const user = getUser()
  const cancelCurrentCardRef = useRef<(() => void) | null>(null)
  const cancelActiveBookingRef = useRef<(() => void) | null>(null)
  // Set to true when the user sends a new message while a booking widget is open.
  // Guards bookMentorSession's human-in-the-loop render from showing skeletons or
  // re-opening a widget for any erroneous LLM re-invocation in the same window.
  const bookingJustCancelledRef = useRef(false)
  const bookingCancelledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Permanently hides the cancelled booking widget until CopilotKit officially
  // closes the action ('complete'). Unlike bookingJustCancelledRef it has no timer —
  // the widget stays gone for as long as the action lingers in 'executing' state.
  const bookingWasCancelledRef = useRef(false)
  const [profileUpdateActive, setProfileUpdateActive] = useState(false)
  const [showEmptyState, setShowEmptyState] = useState(true)

  const narrow = useNarrow()
  const askPlaceholder = narrow ? ASK_STRINGS.placeholderShort : ASK_STRINGS.placeholder
  const firstName = (user?.fullName ?? '').split(' ')[0] || 'there'
  const greeting = ASK_STRINGS.greeting(firstName)

  // Spoken replies: a finished reply read aloud on request (AI backend /tts).
  const readAloud = useReadAloud()
  const stopReadAloud = readAloud.stop

  // v2: one AG-UI agent per surface; thread id shared via AssistantProvider's
  // plain React context (the popup's v1 CopilotKit provider is unrelated).
  const threadId = useSharedAssistantThreadId() || undefined
  const resetAssistantThread = useResetAssistantThread()
  const { agent } = useAgent({
    agentId: COPILOT_AGENT,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  })
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG-UI AbstractAgent shape is loose
  const agentAny = agent as any
  const isRunning: boolean = Boolean(agentAny?.isRunning)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = agentAny?.messages ?? []

  // CopilotKit v2 uses StickToBottom (use-stick-to-bottom library) for scrolling.
  // StickToBottom.Content renders TWO nested divs:
  //   outer div (scrollRef) — height:100%, overflow:auto set via JS inline style — REAL scroll container
  //   inner div (contentRef) — receives className="cpk:overflow-y-auto..." — height = content height, cannot actually scroll
  // The inner div has overflow-y:auto from its CSS class, so a naive overflow check finds it first.
  // Since its height equals its content, scrollHeight === clientHeight and scrollTop is clamped to 0.
  // Adding scrollHeight > clientHeight skips the inner div and targets the outer div (real scroll container).
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!chatContainerRef.current) return
      const anchor = chatContainerRef.current.querySelector('[data-testid="copilot-scroll-content"]')
      if (!anchor) return
      let el = anchor.parentElement as HTMLElement | null
      while (el && el !== chatContainerRef.current) {
        const { overflow, overflowY } = getComputedStyle(el)
        if (/auto|scroll/.test(overflow + overflowY) && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight
          return
        }
        el = el.parentElement as HTMLElement | null
      }
    }))
  }, [])

  // Send a user message and run the agent — replaces v1 appendMessage().
  // Submissions are SERIALIZED on a promise chain: concurrent runAgent calls
  // get rejected and silently drop replies, so each submission waits for the
  // previous run to finish (same pattern as the voice test surface).
  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      runChainRef.current = runChainRef.current.then(async () => {
        try {
          agentAny.addMessage({ id: makeUuid(), role: 'user', content: text })
          scrollChatToBottom()
          await copilotkit.runAgent({ agent })
        } catch (err) {
          console.warn('[assistant] runAgent failed', err)
        }
      })
    },
    [agent, agentAny, copilotkit, scrollChatToBottom],
  )

  // Try again on the latest reply: drop it locally and run again from the
  // last user message (the LangGraph agent forks that message's checkpoint,
  // so the old reply doesn't linger in the thread).
  const regenerate = useCallback(() => {
    if (agentAny?.isRunning) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = agentAny?.messages ?? []
    let i = list.length - 1
    while (i >= 0 && list[i]?.role !== 'user') i--
    if (i < 0) return
    runChainRef.current = runChainRef.current.then(async () => {
      try {
        agentAny.setMessages?.(list.slice(0, i + 1))
        await copilotkit.runAgent({ agent })
        // The greeting is added in the browser with the first question, so the
        // checkpoint the redo starts from can predate it: keep it on top.
        const first = list[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const now: any[] = agentAny?.messages ?? []
        if (first?.role === 'assistant' && !now.some((m) => m?.id === first.id)) {
          agentAny.setMessages?.([first, ...now])
        }
      } catch (err) {
        console.warn('[assistant] regenerate failed', err)
      }
    })
  }, [agent, agentAny, copilotkit])

  // Visible failure state for runs (backend down / network drop). Retry
  // re-runs the agent; the user's message is already in the local thread.
  const [runFailed, setRunFailed] = useHanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent }).catch(() => setRunFailed(true))
  }, [agent, copilotkit, setRunFailed])

  // Realtime voice: mic → streaming STT → agent run → sentence-streamed TTS.
  const {
    voiceOn,
    caption: voiceCaption,
    voiceState,
    callStartedAt,
    isMuted,
    toggleMute,
    startVoice,
    stopVoice,
    stopSpeaking,
    audioRef,
  } = useStreamingVoice({
    agent,
    submit: sendMessage,
    // Barge-in: user talked over the reply — also halt generation server-side.
    onInterrupt: () => {
      try {
        copilotkit.stopAgent({ agent })
      } catch {
        /* idle agent — nothing to stop */
      }
    },
  })

  // Wire pill clicks to the agent's send function.
  // stopSpeaking clears any TTS queue still draining from the previous response
  // so the options audio doesn't keep playing after the user makes a selection.
  useEffect(() => {
    onPillClickRef.current = (text: string) => {
      stopSpeaking()
      stopReadAloud()
      sendMessage(text)
    }
    return () => { onPillClickRef.current = null }
  }, [sendMessage, stopSpeaking, stopReadAloud])

  // Stop TTS when the user sends a typed message while voice is active.
  // Only fires for HanaChatInput submissions — voice STT finals go through
  // submitRef and never touch beforeSendRef, so the voice session is unaffected.
  useEffect(() => {
    beforeSendRef.current = () => {
      stopReadAloud()
      if (voiceOn) stopSpeaking()
    }
    return () => { beforeSendRef.current = null }
  }, [voiceOn, stopSpeaking, stopReadAloud])

  // Keep the ref pointing at the current sendMessage (it changes when useAgent
  // swaps the provisional agent for the real per-thread clone after connect).
  useEffect(() => {
    onToolStartRef.current = sendMessage
    return () => { onToolStartRef.current = null }
  }, [sendMessage])

  // Stable identity: tool render closures may capture this on the very first
  // render and never refresh, so it must not close over sendMessage directly.
  const handleToolStart = useCallback((msg: string) => {
    onToolStartRef.current?.(msg)
  }, [])

  // Greeting overlay: shown on a fresh thread; a starter (or any first
  // message, typed or voice) dismisses it and reveals the chat. The greeting
  // is injected first so the thread keeps it, rendered like Hana's replies.
  const handleSendFromEmptyState = useCallback(
    (msg: string) => {
      if (voiceOn) stopSpeaking()
      stopReadAloud()
      agentAny.addMessage({
        id: makeUuid(),
        role: 'assistant',
        content: greeting,
      })
      setShowEmptyState(false)
      setTimeout(() => sendMessage(msg), 50)
    },
    [agentAny, sendMessage, voiceOn, stopSpeaking, stopReadAloud, greeting],
  )
  useEffect(() => {
    if (messages.length > 0) setShowEmptyState(false)
  }, [messages.length])

  // Plain text of a message, with our sentinel comments stripped.
  const messageText = useCallback((msg: { content?: unknown }): string => {
    const raw = msg?.content
    const text =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : '')).join('')
          : ''
    // A shared document is exported as its name, not its full text.
    const { message, docName } = splitSharedDocument(text.replace(/<!--[\s\S]*?-->/g, ''))
    return (docName ? `${message.trim()}\n[Shared document: ${docName}]` : message).trim()
  }, [])

  const hasConversation = messages.some((msg) => msg?.role === 'user' || msg?.role === 'assistant')

  // Export the visible conversation as a downloadable .txt transcript.
  const handleExportChat = useCallback(() => {
    const lines = messages
      .filter((msg) => msg?.role === 'user' || msg?.role === 'assistant')
      .map((msg) => {
        const who = msg.role === 'user' ? 'You' : 'Hana'
        const text = messageText(msg)
        return text ? `${who}: ${text}` : ''
      })
      .filter(Boolean)
    if (lines.length === 0) return
    const header = `Hana — chat transcript\nExported ${new Date().toLocaleString()}\n\n`
    const blob = new Blob([header + lines.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hadafi-chat-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [messages, messageText])

  // Reset to a fresh conversation: stop any run/voice, clear the visible
  // messages, re-show the empty state, and mint a new backend thread (so the
  // LangGraph checkpoint history doesn't bleed into the new chat).
  const handleResetChat = useCallback(() => {
    if (voiceOn) stopVoice()
    stopReadAloud()
    try { copilotkit.stopAgent?.({ agent }) } catch { /* no active run */ }
    try { agentAny.setMessages?.([]) } catch { /* older agent shape */ }
    setShowEmptyState(true)
    resetAssistantThread()
  }, [voiceOn, stopVoice, copilotkit, agent, agentAny, resetAssistantThread, stopReadAloud])

  // v1 hooked HadafiChatInput's beforeSend to cancel an open booking widget when
  // the user submitted a new message. The v2 default chat input has no such
  // hook, so watch the agent's message list instead: a new user message while a
  // booking widget is open triggers the same cancellation flow.
  const lastUserMsgIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const lastId: string | null = lastUser?.id ?? null
    if (lastUserMsgIdRef.current === undefined) {
      // First observation — record the baseline without triggering cancels.
      lastUserMsgIdRef.current = lastId
      return
    }
    if (lastId === lastUserMsgIdRef.current) return
    lastUserMsgIdRef.current = lastId
    if (cancelActiveBookingRef.current) {
      bookingJustCancelledRef.current = true
      bookingWasCancelledRef.current = true
      if (bookingCancelledTimerRef.current) clearTimeout(bookingCancelledTimerRef.current)
      bookingCancelledTimerRef.current = setTimeout(() => {
        bookingJustCancelledRef.current = false
      }, 3000)
      cancelActiveBookingRef.current()
    }
  }, [messages])

  // --- Fetch live user snapshot on mount ---
  // Runs 4 API calls in parallel so the LLM has real DB data from the first message.
  useEffect(() => {
    let cancelled = false

    void Promise.all([
      fetchUserCertificates().catch(() => [] as CertificateWithCourse[]),
      fetchLearnerCourses().catch(() => []),
      getSmeSessions().catch(() => null),
      fetchOffers().catch(() => null),
    ]).then(([certs, courses, sessions, offers]) => {
      if (cancelled) return
      const certsArr = Array.isArray(certs) ? certs : []
      const coursesArr = Array.isArray(courses) ? courses : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offersData = offers as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionsData = sessions as any

      setUserSnapshot({
        certificates: certsArr.map((c) => ({
          title: c.courseTitle,
          number: c.certificateNumber,
        })),
        enrolledCourses: coursesArr
          .filter((c) => c.isEnrolled)
          .map((c) => ({
            title: c.title,
            progress: `${c.progressPercentage ?? 0}%`,
            difficulty: c.difficulty ?? '',
          })),
        upcomingSessions: ((sessionsData?.upcoming ?? []) as Array<{
          mentorUser?: { fullName?: string }
          slot?: { startsAt?: string }
        }>).slice(0, 5).map((s) => ({
          mentor: s.mentorUser?.fullName ?? null,
          date: s.slot?.startsAt ?? null,
        })),
        pointsBalance: offersData?.userPoints ?? 0,
        offersCount: (offersData?.offers ?? []).length,
      })
    })

    return () => { cancelled = true }
  }, [])

  // --- System instructions forwarded to the LangGraph backend via useAgentContext ---
  // The v2 CopilotChat has no `instructions` prop. This entry rides in the
  // AG-UI request's context array, which copilotkit-voice's runtime reads and
  // passes as configurable.systemPrompt to the LangGraph graph (same contract
  // as v1's body.context).
  useAgentContext({
    description: '__system_prompt__',
    value: ASSISTANT_INSTRUCTIONS,
  })

  // --- Passive context: agent always knows where the user is and who they are ---
  useAgentContext({
    description: 'LIVE real-time page context — always reflects the exact page the user is on RIGHT NOW, updated instantly on every navigation regardless of how they navigated (sidebar, button, browser, or chat action). This is the authoritative source for the current page. Always use this value to answer page-related questions; never infer the page from earlier conversation messages.',
    value: { pageName: PAGE_NAMES[pathname] ?? 'Dashboard' },
  })

  useAgentContext({
    description: 'The logged-in user basic info',
    value: {
      name: user?.fullName ?? null,
      email: user?.email ?? null,
      role: user?.role ?? null,
      country: user?.country ?? null,
    },
  })

  useAgentContext({
    description:
      "Live snapshot of this user's current data — fetched fresh from the database each time the chat opens. " +
      'Use this to answer questions about their achievements, certificates, courses, sessions, and points ' +
      'without navigating away. If loading is true, tell the user you are fetching their latest data.',
    value: userSnapshot ?? { loading: true },
  })

  useAgentContext({
    description: 'Whether a profile update card is currently open. If true, do NOT call updateProfileField again — a card is already waiting for user input.',
    value: { profileUpdateCardActive: profileUpdateActive },
  })

  // --- Catalogue lookup for semantic matching ---
  // AI calls this first when the user asks for content by topic, then passes matched IDs to show*Cards.
  // Returns only id+title (or slug+name) — compact enough to never hit LangGraph serialization limits.
  useFrontendTool({
    name: 'searchCatalogue',
    description:
      'Fetch the current content catalogue so you can semantically match user intent to IDs. ' +
      'ALWAYS call this FIRST before any topic-based show*Cards action. ' +
      'Pass only the types relevant to the user\'s query. ' +
      'Returns id+title for each item — use semantic reasoning to identify which IDs match.',
    parameters: z.object({
      types: z
        .array(z.string())
        .describe(
          'The type(s) needed for your next action. ' +
            'For showResourcesForIntent (GOAL intent): pass ALL five types at once: ' +
            '["courses","offers","humanMentors","aiMentors","aiTools"]. ' +
            'For individual show*Cards: pass ONLY the one matching type — ' +
            '["courses"] for showCoursesByTopic, ["offers"] for showOfferCards, ' +
            '["humanMentors"] for showHumanMentorCards, ["aiMentors"] for showAiMentorCards, ' +
            '["events"] for showEventCards, ["aiTools"] for showAiToolCards. ' +
            'Only ["humanMentors","aiMentors"] together when the user asks for mentors without specifying AI or human. ' +
            'NEVER pass all five types for individual show*Cards actions.',
        ),
    }),
    render: ({ status }) => {
      if (status !== ToolCallStatus.InProgress) return <></>
      return <p className="text-xs text-ui-muted py-1 italic">Searching the catalogue…</p>
    },
    handler: async ({ types }) => {
      const results: Record<string, unknown[]> = {}
      await Promise.all(
        [
          types.includes('courses') &&
            fetchLearnerCourses()
              .then((d) => { results.courses = d.map((c) => ({ id: c.id, title: c.title })) })
              .catch(() => {}),
          types.includes('offers') &&
            fetchOffers()
              .then((d) => { results.offers = (d?.offers ?? []).map((o) => ({ id: o.id, title: o.title })) })
              .catch(() => {}),
          types.includes('humanMentors') &&
            getMentors()
              .then((d) => { results.humanMentors = d.map((m) => ({ id: m.id, name: m.fullName })) })
              .catch(() => {}),
          types.includes('aiMentors') &&
            Promise.resolve().then(() => {
              results.aiMentors = getAllAiMentors().map((m) => ({ slug: m.slug, name: m.name }))
            }),
          types.includes('events') &&
            fetchMyEvents()
              .then((d) => { results.events = d.map((e) => ({ id: e.id, title: e.title })) })
              .catch(() => {}),
          types.includes('aiTools') &&
            Promise.resolve().then(() => {
              results.aiTools = [
                { id: 'business-idea', title: 'Business Ideas', description: 'Generate tailored business ideas based on your passion and experience' },
                { id: 'business-plan', title: 'Business Plan', description: 'Create a comprehensive, investor-ready business plan' },
                { id: 'marketing-plan', title: 'Marketing Plan', description: 'Build a complete marketing strategy with ads, social media, and email' },
                { id: 'ai-proposal', title: 'AI Proposal', description: 'Draft a persuasive product or sales proposal for client pitches' },
              ]
            }),
        ].filter(Boolean),
      )
      return JSON.stringify(results)
    },
  })

  // --- Navigation-only: pages with no structured data to return ---
  useFrontendTool({
    name: 'navigateTo',
    description:
      'Navigate to a dashboard page that has no specific data to fetch. Use for: overview/home/dashboard home → "overview"; support/help/FAQ/contact → "support". Do NOT use for AI Mentors — use openAiMentorsAndGetData instead.',
    parameters: z.object({
      page: z.enum(['overview', 'dashboard', 'support']).describe('The page to navigate to'),
    }),
    handler: async ({ page }) => {
      const routes: Record<string, string> = {
        overview: '/dashboard',
        dashboard: '/dashboard',
        support: '/dashboard/support',
      }
      const url = routes[page]
      if (!url) return `I don't know how to navigate to "${page}" with this action. Please use the appropriate action.`
      router.push(url)
      return `Navigated to ${page}.`
    },
  })

  useFrontendTool({
    name: 'openAiMentorsAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      'Open the AI Mentors page and return the list of available AI mentor coaches. Call this when the user asks for AI mentors, AI coaches, virtual mentors, bot mentors, digital coaches, or AI-powered mentors. Do NOT call navigateTo for this — always use this action instead.',
    handler: async () => {
      router.push('/dashboard/ai-mentors')
      const mentors = getAllAiMentors()
      const summary = mentors.map((m) => ({
        name: m.name,
        specialty: m.specialty,
        description: m.description,
      }))
      return `Opened AI Mentors page. ${mentors.length} AI mentor(s) available: ${JSON.stringify(summary)}`
    },
  })

  // --- Compound navigate + fetch actions ---
  //
  // Design decisions:
  // 1. router.push() is called BEFORE awaiting the fetch — this avoids a race
  //    condition where a setTimeout-deferred navigation fires between the tool
  //    result being returned and CopilotKit sending it to LangGraph, which
  //    caused an intermediate re-render that interrupted the SSE stream.
  // 2. Only the key semantic fields are returned (no URLs, ids, timestamps).
  //    The full raw JSON blobs were growing the LangGraph message history
  //    rapidly, increasing token usage and occasionally triggering context
  //    errors on the next user message.
  // 3. All handlers are wrapped in try-catch so an API error returns a message
  //    (becoming a tool result) rather than leaving the tool call unresolved.

  useFrontendTool({
    name: 'openProfileAndGetData',
    description:
      "Open the profile page and fetch the user's full stored profile record. Call this when the user asks to open, view, or navigate to their profile, account settings, personal details, my info, edit profile, achievements, my achievements, certificates, or my certificates. The profile page contains an achievements/certifications section showing earned course certificates. Do NOT call this just to answer a simple question about email, name, or country — those are already in the user context.",
    handler: async () => {
      if (NAVIGATION_ACTIONS_ENABLED) router.push('/dashboard/profile')
      try {
        // Fetch profile and certificates in parallel for full user awareness
        const [res, certs] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiFetch<any>('/api/account/me'),
          fetchUserCertificates().catch(() => [] as CertificateWithCourse[]),
        ])
        // API may return { data: { user: {...} } } or the user object directly.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u: Record<string, any> = res?.data?.user ?? res?.data ?? res ?? {}
        const certsArr = Array.isArray(certs) ? certs : []
        // Return only the relevant fields — skip URLs and internal IDs.
        const summary = {
          fullName: u['fullName'],
          email: u['email'],
          country: u['country'],
          company: u['company'],
          bio: u['bio'],
          phone: u['phone'],
          role: u['role'],
          certificates: certsArr.map((c) => ({ title: c.courseTitle, number: c.certificateNumber })),
        }
        return `Opened profile page. Profile data: ${JSON.stringify(summary)}`
      } catch {
        return 'Opened profile page. (Could not load profile data.)'
      }
    },
  })

  useFrontendTool({
    name: 'openSessionsAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      "Open the sessions page and fetch the user's upcoming and past mentor sessions. Call this when the user mentions: sessions, appointments, bookings, upcoming calls, scheduled calls, my schedule, or mentor sessions.",
    handler: async () => {
      router.push('/dashboard/sessions')
      try {
        const data = await getSmeSessions()
        const upcoming = (data?.upcoming ?? []).map((s) => ({
          mentor: s.mentorUser?.fullName,
          date: s.slot?.startsAt,
          status: s.status,
        }))
        const past = (data?.past ?? []).map((s) => ({
          mentor: s.mentorUser?.fullName,
          date: s.slot?.startsAt,
          status: s.status,
        }))
        return `Opened sessions page. Upcoming: ${JSON.stringify(upcoming)}. Past: ${JSON.stringify(past)}`
      } catch {
        return 'Opened sessions page. (Could not load session data.)'
      }
    },
  })

  useFrontendTool({
    name: 'openCoursesAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      "Open the courses page and fetch the user's enrolled courses with progress. Call this when the user says: 'go to courses', 'take me to courses', 'open courses', 'show courses', or mentions: courses, learning, training, lessons, classes, enrol, my progress, modules, or curriculum. NEVER use navigateTo for courses — always use this action.",
    handler: async () => {
      router.push('/dashboard/courses')
      try {
        const data = await fetchLearnerCourses()
        const courses = Array.isArray(data) ? data : []
        const summary = courses.map((c) => ({
          title: c.title,
          difficulty: c.difficulty,
          enrolled: c.isEnrolled,
          progress: `${c.progressPercentage ?? 0}%`,
        }))
        return `Opened courses page. ${courses.length} course(s): ${JSON.stringify(summary)}`
      } catch {
        return 'Opened courses page. (Could not load course data.)'
      }
    },
  })

  useFrontendTool({
    name: 'openEventsAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      'Open the events page and fetch the list of published live events. Call this when the user mentions: events, live events, webinars, workshops, upcoming events, RSVP, or livestream.',
    handler: async () => {
      router.push('/dashboard/events')
      try {
        const data = await fetchMyEvents()
        const events = Array.isArray(data) ? data : []
        const summary = events.map((e) => ({
          title: e.title,
          type: e.type,
          date: e.date,
          time: e.time,
          booked: e.booked ?? false,
        }))
        return `Opened events page. ${events.length} event(s): ${JSON.stringify(summary)}`
      } catch {
        return 'Opened events page. (Could not load events.)'
      }
    },
  })

  useFrontendTool({
    name: 'openOffersAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      "Open the offers page and fetch the user's available offers and points balance. Call this when the user mentions: offers, discounts, coupons, deals, vouchers, rewards, points, partner offers, marketplace, perks, or savings.",
    handler: async () => {
      router.push('/dashboard/offers')
      try {
        const data = await fetchOffers()
        const offers = (data?.offers ?? []).map((o) => ({
          title: o.title,
          category: o.category,
          price: o.priceLabel,
          pointsCost: o.pointsCost,
        }))
        return `Opened offers page. Points balance: ${data?.userPoints ?? 0}. ${offers.length} offer(s): ${JSON.stringify(offers)}`
      } catch {
        return 'Opened offers page. (Could not load offers.)'
      }
    },
  })

  useFrontendTool({
    name: 'openHumanMentorsAndGetData',
    available: NAVIGATION_ACTIONS_ENABLED,
    description:
      'Open the human mentors page and fetch the list of available real human mentors. Call this when the user mentions: human mentors, real mentor, real coach, book a mentor, find a mentor, expert session, programme mentor, human coach, one-on-one session, or 1-on-1. This is NOT for AI mentors — use openAiMentorsAndGetData for those.',
    handler: async () => {
      router.push('/dashboard/human-mentors')
      try {
        const data = await getMentors()
        const mentors = Array.isArray(data) ? data : []
        const summary = mentors.map((m) => ({
          name: m.fullName,
          expertise: m.expertise ?? [],
          timezone: m.timezone,
          bio: typeof m.bio === 'string' ? m.bio.slice(0, 120) : null,
        }))
        return `Opened human mentors page. ${mentors.length} mentor(s): ${JSON.stringify(summary)}`
      } catch {
        return 'Opened human mentors page. (Could not load mentor data.)'
      }
    },
  })

  // ─── Card-display actions: render inline cards for discovery/recommendation ──
  //
  // These coexist with the openXxxAndGetData navigation actions.
  // The system prompt routes recommendation intent here ("show me", "find me",
  // "recommend") and explicit navigation intent to openXxxAndGetData ("go to",
  // "open", "take me to").

  useFrontendTool({
    name: 'showAllCourses',
    description:
      'Show all published courses — enrolled ones appear first. Use for general queries: "all courses", "available courses", "what courses are there", "show me courses", "what courses do I have".',
    render: ({ status, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are the available courses</p>
          <CourseAssistantCards intent="all" actionStatus={status} />
        </div>
      )
    },
    handler: async () => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = filterCourses(courses, 'all')
        if (filtered.length === 0) return 'No courses found.'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showEnrolledCourses',
    description:
      'Show all courses the user is currently enrolled in (any progress level, including 0%). Use for: "courses I am enrolled in", "my courses", "enrolled courses", "courses I have", "what am I enrolled in".',
    render: ({ status, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are your enrolled courses</p>
          <CourseAssistantCards intent="enrolled" actionStatus={status} />
        </div>
      )
    },
    handler: async () => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = filterCourses(courses, 'enrolled')
        if (filtered.length === 0) return 'You are not enrolled in any courses yet.'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showInProgressCourses',
    description:
      'Show courses the user has started but not yet completed (1–99% progress). Use for: "in-progress courses", "continue learning", "courses I started", "unfinished courses", "resume a course", "incomplete courses", "courses I\'m taking".',
    render: ({ status, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are your in-progress courses</p>
          <CourseAssistantCards intent="in-progress" actionStatus={status} />
        </div>
      )
    },
    handler: async () => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = filterCourses(courses, 'in-progress')
        if (filtered.length === 0)
          return 'No in-progress courses found. You have not started any enrolled courses yet, or all are complete.'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showPendingCourses',
    description:
      'Show courses the user is enrolled in but has not started yet (exactly 0% progress). Use for: "pending courses", "not started courses", "courses I haven\'t begun", "enrolled but not started", "courses waiting to start".',
    render: ({ status, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are your pending courses</p>
          <CourseAssistantCards intent="not-started" actionStatus={status} />
        </div>
      )
    },
    handler: async () => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = filterCourses(courses, 'not-started')
        if (filtered.length === 0)
          return 'No pending courses. All your enrolled courses have been started (or you have none enrolled).'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showCompletedCourses',
    description:
      'Show courses the user has fully completed (100% progress). Use for: "completed courses", "finished courses", "done courses", "courses I finished", "courses I completed".',
    render: ({ status, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are your completed courses</p>
          <CourseAssistantCards intent="completed" actionStatus={status} />
        </div>
      )
    },
    handler: async () => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = filterCourses(courses, 'completed')
        if (filtered.length === 0) return 'No completed courses yet. Keep learning!'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showCoursesByTopic',
    description:
      'Show courses semantically matching the user\'s topic or interest. BEFORE calling this, consult the content catalogue in your context, identify course IDs that are semantically relevant to the user\'s intent, and pass those IDs. Use when the user mentions a subject: "courses about blogs", "sales courses", "courses related to marketing", "find courses on leadership", "X training", "learn about X".',
    parameters: z.object({
      ids: z
        .array(z.string())
        .describe(
          'IDs of courses from the catalogue that are semantically relevant to the user\'s intent. Look at the catalogue, reason about which courses match the topic by meaning (not just keyword), and pass their IDs. Pass an empty array only if truly nothing is relevant.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are the matching courses</p>
          <CourseAssistantCards intent="topic" ids={args.ids} actionStatus={status} />
        </div>
      )
    },
    handler: async ({ ids }) => {
      try {
        const courses = await fetchLearnerCourses()
        const filtered = (ids && ids.length > 0) ? courses.filter((c) => ids.includes(c.id)) : []
        if (filtered.length === 0)
          return 'No courses found matching that topic. Suggest trying a different search or browsing all courses.'
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load courses. Suggest visiting the Courses page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showOfferCards',
    description:
      'Display filtered offer cards inline in the chat. Use when the user asks for offers, deals, discounts, partner offers, points redemption, or anything in the marketplace — without explicitly asking to navigate. When the user mentions a topic or interest, consult the catalogue and pass the IDs of semantically matching offers. For explicit navigation ("go to offers", "open offers"), use openOffersAndGetData instead.',
    parameters: z.object({
      ids: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of offers from the catalogue that are semantically relevant to the user\'s intent. Omit or pass empty array to show all offers.',
        ),
      redeemableOnly: z
        .boolean()
        .optional()
        .describe(
          'Set to true when the user wants only offers they can afford with their current points balance.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">
            {args.redeemableOnly ? 'Here are the offers you can redeem' : 'Here are the available offers'}
          </p>
          <OfferAssistantCards ids={args.ids} redeemableOnly={args.redeemableOnly} actionStatus={status} />
        </div>
      )
    },
    handler: async ({ ids }) => {
      try {
        const data = await fetchOffers()
        const allOffers = data?.offers ?? []
        const filtered = (ids && ids.length > 0) ? allOffers.filter((o) => ids.includes(o.id)) : allOffers
        if (filtered.length === 0) {
          return `No offers found${ids?.length ? ' matching that topic' : ''}. User has ${data?.userPoints ?? 0} points.`
        }
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load offers. Suggest the user visit the Offers page directly.'
      }
    },
  })

  useFrontendTool({
    name: 'showHumanMentorCards',
    description:
      'Display filtered human mentor cards inline in the chat. Use for recommendation queries ("recommend a mentor", "find a mentor for X", "who can help with sales"). When the user mentions a topic or need, consult the catalogue and pass the IDs of semantically matching mentors. For explicit navigation ("go to mentors", "open human mentors"), use openHumanMentorsAndGetData instead.',
    parameters: z.object({
      ids: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of human mentors from the catalogue that are semantically relevant to the user\'s need, best match first (cards keep this order). Omit or pass empty array to show all mentors.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are the available human mentors</p>
          <HumanMentorAssistantCards
            ids={args.ids}
            intent={args.ids?.length ? 'topic' : 'all'}
            actionStatus={status}
            onBookNow={(mentorName) => {
              if (agentAny?.isRunning) return
              // User explicitly initiating a new booking — clear any lingering suppression
              // flag from a previously cancelled booking that never reached CopilotKit 'complete'.
              bookingWasCancelledRef.current = false
              sendMessage(`Book a session with ${mentorName}`)
            }}
          />
        </div>
      )
    },
    handler: async ({ ids }) => {
      try {
        const mentors = await getMentors()
        const filtered = (ids && ids.length > 0) ? mentors.filter((m) => ids.includes(m.id)) : mentors
        if (filtered.length === 0) {
          return 'No human mentors found matching that criteria. Suggest trying a broader search.'
        }
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load mentor data. Suggest visiting the Human Mentors page.'
      }
    },
  }, [sendMessage])

  useFrontendTool({
    name: 'showAiMentorCards',
    description:
      'Display filtered AI mentor cards inline in the chat. Use for recommendation queries ("recommend an AI mentor", "which AI mentor handles marketing", "find an AI coach for X"). When the user mentions a topic, consult the catalogue and pass the slugs of semantically matching AI mentors. For explicit navigation ("go to AI mentors", "open AI mentors"), use openAiMentorsAndGetData instead.',
    parameters: z.object({
      slugs: z
        .array(z.string())
        .optional()
        .describe(
          'Slugs of AI mentors from the catalogue that are semantically relevant to the user\'s need. Omit or pass empty array to show all AI mentors.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are the available AI mentors</p>
          <AiMentorAssistantCards
            slugs={args.slugs}
            actionStatus={status}
          />
        </div>
      )
    },
    handler: async ({ slugs }) => {
      const allMentors = getAllAiMentors()
      const filtered = (slugs && slugs.length > 0)
        ? allMentors.filter((m) => slugs.includes(m.slug))
        : [...allMentors]
      if (filtered.length === 0) {
        return `No AI mentors found matching that criteria. Available specialties: ${allMentors.map((m) => m.specialty).join(', ')}.`
      }
      return `${filtered.length} result(s) shown in cards.`
    },
  })

  useFrontendTool({
    name: 'showAiToolCards',
    description:
      'Display AI business tool cards inline in the chat. ' +
      'Use ONLY for DISCOVERY queries — when the user asks what tools exist, wants to see which tool fits their need, ' +
      'or asks about a specific tool without explicitly starting it. ' +
      'Examples: "what AI tools do you have?", "show me AI tools", "which tool helps with marketing?", "I want a tool for business planning". ' +
      'Do NOT call this when the user wants to CREATE/MAKE/START/GENERATE a business document — for those, ACTION intent applies and you must call `enterBusinessTool` instead.',
    parameters: z.object({
      ids: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of tools from the catalogue that semantically match the user\'s need. ' +
            'Valid values: business-idea, business-plan, marketing-plan, ai-proposal. ' +
            'Omit or pass empty array to show all four tools.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">
            Here are the available AI business tools
          </p>
          <AiToolAssistantCards
            ids={args.ids}
            onStart={handleToolStart}
            actionStatus={status}
          />
        </div>
      )
    },
    handler: async ({ ids }) => {
      const ALL_TOOL_IDS = ['business-idea', 'business-plan', 'marketing-plan', 'ai-proposal']
      const filtered = (ids && ids.length > 0)
        ? ALL_TOOL_IDS.filter((id) => ids.includes(id))
        : [...ALL_TOOL_IDS]
      if (filtered.length === 0) {
        return 'No AI tools found matching that criteria. Available tools: Business Ideas, Business Plan, Marketing Plan, AI Proposal.'
      }
      return `${filtered.length} result(s) shown in cards.`
    },
  })

  useFrontendTool({
    name: 'showResourcesForIntent',
    description:
      'Show all relevant platform resources (courses, offers, human mentors, AI mentors, AI tools) ' +
      'grouped by category based on the user\'s business goal or challenge. ' +
      'Use for GOAL intent — when the user describes a business objective or problem in natural language ' +
      'without explicitly asking for a specific resource type. ' +
      'Examples: "I want to increase sales", "How can I close more deals?", ' +
      '"I need more customers", "How do I improve my marketing?", "How can I grow my business?". ' +
      'BEFORE calling this, call searchCatalogue(["courses","offers","humanMentors","aiMentors","aiTools"]) ' +
      'to get all catalogue items, then pass the semantically matched IDs for each category. ' +
      'Pass an empty array for any category with no relevant matches — that section is hidden automatically. ' +
      'In every list, put the best match first: cards are shown in the order given.',
    parameters: z.object({
      courseIds: z
        .array(z.string())
        .describe('IDs of courses semantically relevant to the user\'s goal. Pass empty array if none match.'),
      offerIds: z
        .array(z.string())
        .describe('IDs of offers semantically relevant to the user\'s goal. Pass empty array if none match.'),
      mentorIds: z
        .array(z.string())
        .describe('IDs of human mentors semantically relevant to the user\'s goal. Pass empty array if none match.'),
      aiMentorSlugs: z
        .array(z.string())
        .describe('Slugs of AI mentors semantically relevant to the user\'s goal. Pass empty array if none match.'),
      aiToolIds: z
        .array(z.string())
        .describe(
          'IDs of AI tools relevant to the user\'s goal. ' +
            'Valid values: business-idea, business-plan, marketing-plan, ai-proposal. ' +
            'Pass empty array if none match.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      if (status === ToolCallStatus.InProgress) {
        return <p className="text-xs text-ui-muted py-1 italic">Finding matching resources…</p>
      }
      const courseIds = args.courseIds ?? []
      const offerIds = args.offerIds ?? []
      const mentorIds = args.mentorIds ?? []
      const aiMentorSlugs = args.aiMentorSlugs ?? []
      const aiToolIds = args.aiToolIds ?? []
      return (
        <div className="flex flex-col gap-4">
          {courseIds.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are matching courses</p>
              <CourseAssistantCards intent="topic" ids={courseIds} actionStatus={status} />
            </div>
          )}
          {offerIds.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are matching offers</p>
              <OfferAssistantCards ids={offerIds} actionStatus={status} />
            </div>
          )}
          {mentorIds.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are matching human mentors</p>
              <HumanMentorAssistantCards
                ids={mentorIds}
                intent="topic"
                actionStatus={status}
                onBookNow={(mentorName) => {
                  if (agentAny?.isRunning) return
                  bookingWasCancelledRef.current = false
                  sendMessage(`Book a session with ${mentorName}`)
                }}
              />
            </div>
          )}
          {aiMentorSlugs.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are matching AI mentors</p>
              <AiMentorAssistantCards slugs={aiMentorSlugs} actionStatus={status} />
            </div>
          )}
          {aiToolIds.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are matching AI tools</p>
              <AiToolAssistantCards ids={aiToolIds} onStart={handleToolStart} actionStatus={status} />
            </div>
          )}
        </div>
      )
    },
    handler: async ({ courseIds, offerIds, mentorIds, aiMentorSlugs, aiToolIds }) => {
      const counts: string[] = []
      try {
        if (courseIds?.length) {
          const courses = await fetchLearnerCourses()
          const n = courses.filter((c) => courseIds.includes(c.id)).length
          if (n) counts.push(`${n} course(s)`)
        }
        if (offerIds?.length) {
          const data = await fetchOffers()
          const n = (data?.offers ?? []).filter((o) => offerIds.includes(o.id)).length
          if (n) counts.push(`${n} offer(s)`)
        }
        if (mentorIds?.length) {
          const mentors = await getMentors()
          const n = mentors.filter((m) => mentorIds.includes(m.id)).length
          if (n) counts.push(`${n} human mentor(s)`)
        }
        if (aiMentorSlugs?.length) {
          const n = getAllAiMentors().filter((m) => aiMentorSlugs.includes(m.slug)).length
          if (n) counts.push(`${n} AI mentor(s)`)
        }
        if (aiToolIds?.length) counts.push(`${aiToolIds.length} AI tool(s)`)
        if (!counts.length) return 'No matching resources found for that goal.'
        return `${counts.join(', ')} shown in cards.`
      } catch {
        return 'Could not load resources. Please try again.'
      }
    },
  }, [sendMessage])

  useHumanInTheLoop({
    name: 'bookMentorSession',
    description:
      'Show an inline booking widget for a named human mentor. ' +
      'Call this when the user wants to book and has named a mentor. ' +
      'YOUR ENTIRE RESPONSE MUST BE THIS TOOL CALL — zero text before it.',
    parameters: z.object({
      mentorName: z
        .string()
        .describe(
          'The mentor name as explicitly stated in the user\'s current message. Do NOT infer from conversation history — if the user has not named a mentor in this message, do not call this action.',
        ),
    }),
    render: (props) => {
      if (props.status === ToolCallStatus.Complete) {
        bookingWasCancelledRef.current = false
        // v2 delivers tool results as strings — the respond() payload arrives
        // JSON-serialized.
        const outcome = parseToolOutcome<{ cancelled?: boolean; suppressed?: boolean }>(props.result)
        if (outcome?.cancelled) {
          // suppressed=true means this was an erroneous LLM re-invocation auto-cancelled by
          // CancelledBookingGuard — hide the card so no duplicate "Booking not completed" appears.
          if (outcome?.suppressed) return <></>
          return (
            <div className="rounded-[10px] border border-ui-line bg-ui-surface-2 px-4 py-3 my-2 max-w-sm">
              <div className="flex items-center gap-2">
                <Ban className="w-3.5 h-3.5 text-ui-muted flex-shrink-0" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-ui-muted">Booking not completed</p>
                  <p className="text-[12px] text-ui-muted mt-0.5">This booking was cancelled because a new request was started.</p>
                </div>
              </div>
            </div>
          )
        }
        return <></>
      }
      // Suppress skeleton if the LLM erroneously re-invokes bookMentorSession after a
      // user-initiated cancellation (bookingJustCancelledRef guards a 3-second window).
      if (props.status === ToolCallStatus.InProgress) {
        if (bookingJustCancelledRef.current || bookingWasCancelledRef.current) return <></>
        return <AssistantCardSkeleton />
      }
      const { args, respond } = props
      if (!args.mentorName) {
        return <EmptyMentorNameGuard respond={respond} />
      }
      // Auto-cancel without any visible UI if the LLM erroneously opens a new booking
      // widget immediately after a user-initiated cancellation.
      if (bookingJustCancelledRef.current) {
        return <CancelledBookingGuard respond={respond} />
      }
      // The original cancelled action is still in 'executing' state. Use CancelledBookingGuard
      // to attempt a second respond() call — if CopilotKit processes it, the action reaches
      // 'complete' and the 'complete' handler clears bookingWasCancelledRef automatically.
      if (bookingWasCancelledRef.current) {
        return <CancelledBookingGuard respond={respond} />
      }
      return (
        <MentorBookingWidget
          mentorName={args.mentorName}
          respond={(result) => respond?.(result)}
          onRegisterCancel={(fn) => {
            cancelActiveBookingRef.current?.()
            cancelActiveBookingRef.current = fn
          }}
          onDone={() => {
            cancelActiveBookingRef.current = null
          }}
        />
      )
    },
  })

  useFrontendTool({
    name: 'showSessionCards',
    description:
      'Display filtered session cards inline in the chat. Use for status-based session queries: "show upcoming sessions", "show completed sessions", "show cancelled sessions", "my scheduled calls". For explicit navigation ("go to sessions", "open sessions"), use openSessionsAndGetData instead.',
    parameters: z.object({
      statusFilter: z
        .enum(['upcoming', 'completed', 'cancelled'])
        .describe(
          '"upcoming"=confirmed future sessions, "completed"=past finished sessions, "cancelled"=cancelled sessions',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      const sessionTitles: Record<string, string> = {
        upcoming: 'Here are your upcoming sessions',
        completed: 'Here are your completed sessions',
        cancelled: 'Here are your cancelled sessions',
      }
      const filter = (args.statusFilter as 'upcoming' | 'completed' | 'cancelled') ?? 'upcoming'
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">
            {sessionTitles[filter] ?? 'Here are your sessions'}
          </p>
          <SessionAssistantCards statusFilter={filter} actionStatus={status} />
        </div>
      )
    },
    handler: async ({ statusFilter }) => {
      try {
        const data = await getSmeSessions()
        const sessions =
          statusFilter === 'upcoming'
            ? (data?.upcoming ?? [])
            : (data?.past ?? []).filter((s) => s.status === statusFilter)
        if (sessions.length === 0) {
          return `No ${statusFilter} sessions found.`
        }
        return `${sessions.length} result(s) shown in cards.`
      } catch {
        return 'Could not load session data. Suggest visiting the Sessions page.'
      }
    },
  })

  useFrontendTool({
    name: 'showEventCards',
    description:
      'Display filtered event cards inline in the chat. Use for event discovery and recommendation queries: "what events can I join", "show upcoming events", "show event recordings", "find a webinar on X". When the user mentions a topic, consult the catalogue and pass the IDs of semantically matching events. For explicit navigation ("go to events", "open events"), use openEventsAndGetData instead.',
    parameters: z.object({
      statusFilter: z
        .enum(['upcoming', 'completed', 'all'])
        .describe(
          '"upcoming"=future events (with Join CTA), "completed"=past events (Watch Recording where available), "all"=all events',
        ),
      ids: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of events from the catalogue that are semantically relevant to the user\'s topic or interest. Omit or pass empty array to show all events for the given statusFilter.',
        ),
    }),
    render: ({ status, args, result }) => {
      if (status === ToolCallStatus.Complete && !String(result ?? '').includes('shown in cards')) return <></>
      return (
        <div>
          <p className="text-[13px] font-semibold text-ui-muted mb-2">Here are the available events</p>
          <EventAssistantCards
            statusFilter={(args.statusFilter as 'upcoming' | 'completed' | 'all') ?? 'all'}
            ids={args.ids}
            actionStatus={status}
          />
        </div>
      )
    },
    handler: async ({ statusFilter, ids }) => {
      try {
        const allEvents = await fetchMyEvents()
        let filtered = allEvents
        if (statusFilter === 'upcoming') filtered = allEvents.filter((e) => Date.parse(e.endsAt) >= Date.now())
        else if (statusFilter === 'completed') filtered = allEvents.filter((e) => Date.parse(e.endsAt) < Date.now())
        if (ids && ids.length > 0) {
          filtered = filtered.filter((e) => ids.includes(e.id))
        }
        if (filtered.length === 0) {
          return `No ${statusFilter} events found${ids?.length ? ' matching that topic' : ''}.`
        }
        return `${filtered.length} result(s) shown in cards.`
      } catch {
        return 'Could not load event data. Suggest visiting the Events page.'
      }
    },
  })

  // --- Profile field update: single-step flow ---
  //
  // The LLM calls updateProfileField directly — no intermediate notifyProfileUpdate step.
  // Removing the two-step flow eliminates the extra LLM turn where preamble text was generated.
  useHumanInTheLoop({
    name: 'updateProfileField',
    description:
      'Shows an inline card that collects and saves a single profile field. ' +
      'Call this directly when the user wants to update a profile field — no prior step needed. ' +
      'YOUR ENTIRE RESPONSE MUST BE THIS TOOL CALL WITH ZERO TEXT. ' +
      'Any text in the same response appears as a ghost message after the card closes. ' +
      'Clicking Save commits the change directly. No extra confirmation step needed. ' +
      'Call ONCE per field. ' +
      'Supported fields: fullName (Name), company (Company), country (Country), bio (Bio), phone (Phone). ' +
      'Do NOT call this for email, password, or any other field.',
    parameters: z.object({
      field: z
        .enum(['fullName', 'company', 'country', 'bio', 'phone'])
        .describe('The profile field to update'),
    }),
    render: (props) => {
      // Wait for the final args + the respond callback ('executing'). After the
      // user responds, status flips to 'complete' — the card stays mounted at
      // the same tree position so its internal saved/cancelled state persists.
      if (props.status === ToolCallStatus.InProgress) return <></>
      const { args } = props
      // Finished: show the outcome, not the form. The card can remount once the
      // tool completes, and a fresh form would look like it's still waiting.
      if (props.status === ToolCallStatus.Complete) {
        return <FieldUpdateOutcome field={args.field as CollectableField} result={props.result} />
      }
      const respond = props.status === ToolCallStatus.Executing ? props.respond : undefined
      return (
        <FieldUpdateCard
          field={args.field as CollectableField}
          onRegisterCancel={(fn) => {
            cancelCurrentCardRef.current?.()
            cancelCurrentCardRef.current = fn
            setProfileUpdateActive(true)
          }}
          onDone={() => {
            cancelCurrentCardRef.current = null
            setProfileUpdateActive(false)
          }}
          onSave={async (value) => {
            try {
              await apiFetch('/api/account/me', {
                method: 'PUT',
                body: JSON.stringify({ [args.field as string]: value }),
              })
              window.dispatchEvent(new CustomEvent('hadafi:profile-updated'))
              if (NAVIGATION_ACTIONS_ENABLED && pathname !== '/dashboard/profile') {
                router.push('/dashboard/profile')
              }
              void respond?.({ saved: true, field: args.field, value })
              return true
            } catch (err) {
              const message = errorMessage(err, 'Update failed. Please try again.')
              void respond?.({ saved: false, error: message })
              return message
            }
          }}
          onCancel={() => void respond?.({ saved: false, cancelled: true })}
        />
      )
    },
  })

  useFrontendTool({
    name: 'generateAndDeliverDocument',
    description:
      'Called ONLY when a complete, full, multi-section business document has already been written out in a PREVIOUS message and is ready to deliver as a PDF. ' +
      'Shows a card where the user can send the PDF to their email. The card is non-blocking — the user interacts with it independently. ' +
      'PREREQUISITES — ALL must be true before calling: (1) every selection step for the tool has been completed with user confirmation, (2) the complete final document was written in full in your PREVIOUS response turn, (3) the content you are passing is the actual full document text (not a list of options, not input summaries, not your own reasoning). ' +
      'NEVER call this with: a list of options for the user to choose from, a summary of what the user told you, your own planning/reasoning text, or any partial content. ' +
      'ZERO TEXT before the tool call. After the tool call, output the cross-tool suggestion immediately. ' +
      'CONTENT RULE: the content parameter must be ONLY the document text — strip the trailing confirmation question ("Your [document] is ready! Shall I...") before passing.',
    parameters: z.object({
      documentType: z
        .string()
        .describe('One of: business-ideas, business-plan, marketing-plan, product-proposal'),
      title: z.string().describe('Document title, e.g. "GreenTable — Marketing Plan"'),
      content: z.string().describe('The complete generated document as plain text'),
      suggestedEmail: z.string().optional().describe('Pre-fill with the user email from context'),
    }),
    handler: async () => {},
    render: ({ args }) => (
      <DocumentDeliveryCard
        documentType={args.documentType ?? ''}
        title={args.title ?? ''}
        content={args.content ?? ''}
        defaultEmail={args.suggestedEmail ?? (user?.email ?? '')}
      />
    ),
  })

  useEffect(() => {
    if (voiceOn) stopReadAloud()
  }, [voiceOn, stopReadAloud])

  // Copy, read aloud and try again under each finished reply.
  const renderReplyActions = useCallback<HanaReplyActionsRenderer>(
    ({ before, ...reply }) => (
      <>
        <HanaReplyButtons
          {...reply}
          readAloud={readAloud}
          onRegenerate={() => {
            readAloud.stop()
            regenerate()
          }}
          busy={isRunning}
        />
        <ReportAnswerButton
          surface="ask-hana"
          reply={replyPlainText(reply.text)}
          question={[...(before ?? [])].reverse().find((t) => t.role === 'learner')?.text}
          excerpt={excerptBefore(before ?? [])}
          conversation={threadId}
        />
      </>
    ),
    [readAloud, regenerate, isRunning, threadId],
  )

  // Starters and shortcut menus go through the same send path as typing.
  const ask = useCallback(
    (message: string) => {
      if (showEmptyState) {
        handleSendFromEmptyState(message)
        return
      }
      stopSpeaking()
      stopReadAloud()
      sendMessage(message)
    },
    [showEmptyState, handleSendFromEmptyState, stopSpeaking, stopReadAloud, sendMessage],
  )

  // Documents the learner shares go with her next message (read on the server).
  const attachOptions = useMemo(() => hanaAttachOptions(), [])
  const composerOptions = useMemo(
    () => ({
      placeholder: askPlaceholder,
      // A new chat shows the groups as tabs under the greeting instead.
      above: showEmptyState ? undefined : <AskHanaShortcuts onAsk={ask} disabled={isRunning} />,
      attach: attachOptions,
    }),
    [askPlaceholder, showEmptyState, ask, isRunning, attachOptions],
  )

  // --- Home "Ask Hana" hand-off: send the pending question as the learner's
  // first message once the runtime is connected (declared after every tool
  // registration above, so the first run already carries the tools). Polling,
  // because runtimeConnectionStatus isn't reactive.
  const sendFromEmptyRef = useRef(handleSendFromEmptyState)
  useEffect(() => {
    sendFromEmptyRef.current = handleSendFromEmptyState
  })
  useEffect(() => {
    if (!takePendingAsk()) return
    let fired = false
    let kick: ReturnType<typeof setTimeout> | undefined
    const timer = window.setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = copilotkit as any
      if (fired || core.runtimeConnectionStatus !== 'connected' || !core.getAgent?.(COPILOT_AGENT)) return
      fired = true
      window.clearInterval(timer)
      kick = setTimeout(() => {
        const text = pendingAsk
        pendingAsk = null
        if (text) sendFromEmptyRef.current(text)
      }, 60)
    }, 150)
    return () => {
      window.clearInterval(timer)
      if (kick) clearTimeout(kick)
    }
  }, [copilotkit])

  const iconBtn = cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0')

  return (
    <ChatLoadingContext.Provider value={isRunning}>
    <div className={cn('ask-hana hana-studio hadafi-copilot relative flex h-[460px] flex-col overflow-hidden rounded-none bg-ui-bg', className)}>
      {runFailed && <HanaConnectionNotice onRetry={retryRun} />}
      <header className="relative z-[3] flex flex-shrink-0 flex-wrap items-center gap-x-2.5 gap-y-3 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
        <img
          src={HANA_AVATAR_SRC}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 flex-shrink-0 rounded-full object-cover object-top"
        />
        <div className="flex min-w-0 flex-1 basis-[200px] flex-col">
          <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">Ask Hana</h1>
          <p className="text-[13px] leading-snug text-ui-muted">
            Your AI concierge for courses, mentors, offers and business documents
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
          {/* While a call is active the in-call dock below replaces this. */}
          {!voiceOn && <VoiceModeButton onClick={startVoice} agentName="Hana" />}
          <button
            type="button"
            aria-label="Export chat"
            title="Export chat"
            onClick={handleExportChat}
            disabled={!hasConversation}
            className={iconBtn}
          >
            <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="New chat"
            title="New chat"
            onClick={handleResetChat}
            disabled={!hasConversation}
            className={iconBtn}
          >
            <MessageSquarePlus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </header>
      {voiceOn && (
        <VoiceDock
          state={voiceState}
          callStartedAt={callStartedAt}
          isMuted={isMuted}
          caption={voiceCaption}
          agentName="Hana"
          onMute={toggleMute}
          onHangup={stopVoice}
        />
      )}
      <HanaComposerOptions.Provider value={composerOptions}>
        <HanaReplyActions.Provider value={renderReplyActions}>
          <div className="relative z-[1] flex min-h-0 flex-1">
            {/* CopilotChat always takes full height so V2 can measure the input
                bar correctly. The greeting overlays it until the first message. */}
            <div ref={chatContainerRef} className="hadafi-assistant-chat relative min-w-0 flex-1 overflow-hidden">
              <CopilotChat
                agentId={COPILOT_AGENT}
                threadId={threadId}
                messageView={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  assistantMessage: HanaAssistantMessage as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  userMessage: HanaUserMessage as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  cursor: HanaTypingIndicator as any,
                }}
                // Hide the input bar while the greeting overlay is shown on top.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                input={(showEmptyState ? NullInput : HanaChatInput) as any}
                labels={{
                  chatInputPlaceholder: askPlaceholder,
                  welcomeMessageText: greeting,
                }}
              />
              {showEmptyState && (
                <div className="absolute inset-0 z-10 flex flex-col bg-ui-bg">
                  <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-7">
                    <AskHanaGreeting text={greeting} today={ASK_STRINGS.today} />
                    <AskHanaStarters onAsk={ask} />
                  </div>
                  <HanaChatInput onSubmitMessage={handleSendFromEmptyState} isRunning={false} />
                </div>
              )}
            </div>
          </div>
        </HanaReplyActions.Provider>
      </HanaComposerOptions.Provider>
      {/* Persistent audio sink for streaming TTS playback. */}
      <audio ref={audioRef} hidden />
    </div>
    </ChatLoadingContext.Provider>
  )
}
