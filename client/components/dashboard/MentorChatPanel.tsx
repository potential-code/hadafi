'use client'

/**
 * AI mentor chat: a header with the mentor's identity, the mentor's replies
 * beside their tile (copy and read aloud under each, follow-up chips under
 * the latest), the learner's in brand bubbles, ice-breakers as chips over the
 * composer, and (on wide screens) a rail with the mentor's details, human
 * mentors to book and the other AI mentors. The composer can dictate (where
 * the browser supports it), stop a reply and share a document (PDF, Word,
 * text, Markdown or CSV, read on Hadafi's server; nothing is stored).
 *
 * Bot config and the reply stream come through Hadafi's server
 * (/api/ai-mentors), behind the learner's session; the browser never calls
 * the bot service directly.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, btn, Chip, EmptyState } from '@/components/kit'
import { getAiMentorConfig, getMentors, streamAiMentorChat, type AiMentorConfig } from '@/lib/api/sme'
import { aiMentorViewByBotId, aiMentorViews, type AiMentorView } from './aiMentorMeta'
import { ReportAnswerButton, excerptBefore } from './ReportAnswerButton'
import { HanaReplyButtons } from './HanaReplyButtons'
import { useReadAloud, type ReadAloud } from './useHanaVoice'
import { DOCUMENT_ACCEPT, DOCUMENT_DEFAULT_MESSAGE, DOCUMENT_HINT, readDocument, type HanaSharedDocument } from './hanaDocuments'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string
  text: string
  isUser: boolean
  isStreaming?: boolean
  /** The bot's opening line: no reply actions on it. */
  isGreeting?: boolean
  /** A document the learner shared with this message. */
  docName?: string
  /** Follow-up questions the bot offered (its hidden "[Suggestions: a | b]" line). */
  suggestions?: string[]
}

type SharedDoc = HanaSharedDocument

type Attachment =
  | { status: 'reading'; name: string }
  | { status: 'ready'; name: string; doc: SharedDoc }
  | { status: 'error'; name: string; error: string }

interface Props {
  botId: string
  name: string
  specialty: string
  description?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processMarkdown(text: string): string {
  return text
    .replace(/(\d+)\.\s+/g, '\n\n$1. ')
    .replace(/(\d+)\.\s*\n+/g, '$1. ')
    .replace(/([^\d]|^)\.\s+([A-Z])/g, '$1.\n\n$2')
    .replace(/:\s+([A-Z])/g, ':\n\n$1')
    .trim()
}

const DOC_DEFAULT_MESSAGE = DOCUMENT_DEFAULT_MESSAGE
const REPLY_FAILED = "Sorry, I couldn't answer that just now. Please try again."


/**
 * The reply without the bot's hidden "[Suggestions: a | b]" line (also while
 * it is still streaming in), and the suggestions it held.
 */
function splitReply(text: string): { text: string; suggestions: string[] } {
  const at = text.search(/\[\s*Suggestions\s*:/i)
  if (at < 0) return { text, suggestions: [] }
  const inside = text.slice(at).match(/\[\s*Suggestions\s*:\s*([^\]]*)\]/i)?.[1] ?? ''
  return {
    text: text.slice(0, at).trimEnd(),
    suggestions: inside
      .split('|')
      .map((x) => x.trim())
      .filter((x) => x.length > 1 && x.length < 140)
      .slice(0, 4),
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}


interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function useDictation(onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const recRef = useRef<RecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition))
    return () => recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'en'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) final = true
      }
      onTextRef.current(text.trim(), final)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setBlocked(true)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setBlocked(false)
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
    }
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { supported, listening, blocked, start, stop }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** The mentor's face: their specialty icon on a tinted tile. */
function MentorMark({ view, size = 32 }: { view?: AiMentorView; size?: number }) {
  if (!view) {
    return <span aria-hidden className="inline-flex flex-shrink-0 rounded-[10px] bg-ui-surface-2" style={{ width: size, height: size }} />
  }
  const Icon = view.icon
  return (
    <span
      aria-hidden
      className="inline-flex flex-shrink-0 items-center justify-center rounded-[10px]"
      style={{ width: size, height: size, background: view.tile.bg, color: view.tile.fg }}
    >
      <Icon style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} strokeWidth={1.75} />
    </span>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex h-4 items-end gap-1 pt-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ui-muted"
          style={{ animation: 'mentorBounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  )
}

const chipClass =
  'inline-flex min-h-[34px] items-center rounded-full border border-ui-line bg-ui-surface px-3.5 py-1.5 text-left text-[13px] font-medium text-ui-text transition-colors hover:bg-ui-surface-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand'

const iconBtnClass =
  'inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand'

/**
 * The mentor's turn: the reply on the page beside the mentor's tile (no box,
 * like Hana's replies), then copy, read aloud and report.
 */
function MentorTurn({
  view,
  message,
  isLast,
  readAloud,
  onSuggest,
  busy,
  report,
}: {
  view?: AiMentorView
  message: Message
  isLast: boolean
  readAloud: ReadAloud
  onSuggest: (text: string) => void
  busy: boolean
  /** "Report this answer" for this reply. */
  report?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <MentorMark view={view} />
      <div className="min-w-0 flex-1">
        {message.isStreaming && message.text === '' ? (
          // The typing dots keep a small box, so "thinking" still reads.
          <div className="w-fit rounded-2xl rounded-tl-md border border-ui-line bg-ui-surface px-4 py-3.5">
            <TypingDots />
          </div>
        ) : (
          <>
            <div
              dir="auto"
              className="w-fit max-w-[680px] space-y-2 pt-1.5 text-[15px] leading-relaxed text-ui-text [overflow-wrap:anywhere] [&_a]:font-semibold [&_a]:text-ui-brand-text [&_a]:underline-offset-2 hover:[&_a]:underline [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:ps-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:ps-5"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-2 border-s-[3px] border-ui-line ps-3 italic text-ui-muted">{children}</blockquote>
                  ),
                  img: () => null,
                  code: ({ children, className }) => {
                    const isBlock = className?.includes('language-')
                    return isBlock ? (
                      <code className={cn('block overflow-x-auto rounded-lg bg-ui-surface-2 p-2.5 text-xs', className)}>{children}</code>
                    ) : (
                      <code className="rounded bg-ui-surface-2 px-1 py-0.5 text-xs">{children}</code>
                    )
                  },
                }}
              >
                {processMarkdown(message.text)}
              </ReactMarkdown>
            </div>
            {!message.isStreaming && message.text && !message.isGreeting && (
              <div className="hana-reply-actions">
                <HanaReplyButtons id={message.id} text={message.text} isLast={isLast} readAloud={readAloud} />
                {report}
              </div>
            )}
            {isLast && !message.isStreaming && message.suggestions && message.suggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Suggested follow-ups">
                {message.suggestions.map((q) => (
                  <button key={q} type="button" className={chipClass} disabled={busy} onClick={() => onSuggest(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The learner's turn: a brand bubble, right-aligned. */
function LearnerTurn({ message }: { message: Message }) {
  return (
    <div className="mb-4 flex flex-col items-end gap-1.5">
      {message.docName && (
        <span className="inline-flex max-w-[85%] items-center gap-2 rounded-xl border border-ui-line bg-ui-surface px-3 py-2 text-[13px] text-ui-text">
          <FileText className="h-4 w-4 flex-none text-ui-muted" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{message.docName}</span>
        </span>
      )}
      <p
        dir="auto"
        className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ui-brand px-4 py-2.5 text-[15px] leading-relaxed text-white [overflow-wrap:anywhere]"
      >
        {message.text}
      </p>
    </div>
  )
}

/** Wide screens: who this mentor is, people to book, other AI mentors. */
function MentorRail({ view, name, specialty, description }: { view?: AiMentorView; name: string; specialty: string; description?: string }) {
  const { data: humans } = useQuery({ queryKey: ['mentors'], queryFn: getMentors })
  const others = aiMentorViews()
    .filter((m) => m.slug !== view?.slug)
    .slice(0, 3)
  const people = (() => {
    const list = humans ?? []
    const words = specialty
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((w) => w.length > 3)
    const matching = list.filter((h) => h.expertise?.some((e) => words.some((w) => e.toLowerCase().includes(w))))
    return (matching.length ? matching : list).slice(0, 3)
  })()

  return (
    <aside
      aria-label={`About ${name}`}
      className="hidden w-[300px] flex-none flex-col gap-5 overflow-y-auto border-s border-ui-line bg-ui-surface px-4 py-5 xl:flex"
    >
      <section className="flex flex-col gap-2.5 border-b border-ui-line pb-5">
        <MentorMark view={view} size={48} />
        <h2 className="text-base font-semibold text-ui-text">{name}</h2>
        {description && <p className="text-sm leading-relaxed text-ui-muted">{description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Chip>{specialty}</Chip>
          <Chip>Available 24/7</Chip>
        </div>
      </section>
      {people.length > 0 && (
        <section className="flex flex-col gap-2.5 border-b border-ui-line pb-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ui-text">Prefer a person?</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">Book a free one-on-one session with a business mentor.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {people.map((h) => (
              <li key={h.id} className="flex items-center gap-2.5">
                <Avatar name={h.fullName} src={h.avatarUrl} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ui-text">{h.fullName}</span>
                  {h.expertise && h.expertise.length > 0 && (
                    <span className="truncate text-xs text-ui-muted">
                      {h.expertise.filter((e) => !/^featured$/i.test(e)).slice(0, 3).join(', ')}
                    </span>
                  )}
                </span>
                <Link
                  href={`/dashboard/human-mentors?mentor=${encodeURIComponent(h.id)}`}
                  className="rounded-md px-1.5 py-1 text-[13px] font-semibold text-ui-brand-text hover:underline"
                  aria-label={`Book ${h.fullName}`}
                >
                  Book
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="pb-1.5 text-[15px] font-semibold text-ui-text">Other AI mentors</h2>
        {others.map((m) => (
          <Link
            key={m.slug}
            href={`/dashboard/ai-mentors/${m.slug}`}
            className="-mx-1.5 flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-ui-surface-2"
          >
            <MentorMark view={m} size={32} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ui-text">{m.name}</span>
              <span className="truncate text-xs text-ui-muted">{m.specialty}</span>
            </span>
          </Link>
        ))}
      </section>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MentorChatPanel({ botId, name, specialty, description }: Props) {
  const [botConfig, setBotConfig] = useState<AiMentorConfig | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readAloud = useReadAloud()

  // Stable session id for this conversation (the server scopes it to the learner).
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const view = aiMentorViewByBotId(botId)
  const displayName = view?.name ?? botConfig?.name ?? name
  const prePrompts = botConfig?.prePrompt ?? []
  // The bot's own ice-breakers when it has them, else starters for its specialty.
  const starters = prePrompts.length > 0 ? prePrompts : (view?.starters ?? [])

  // A shared document: read in the browser once chosen, sent with the next message.
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readSeq = useRef(0)
  async function pickFile(file: File | undefined) {
    if (!file) return
    const seq = ++readSeq.current
    setAttachment({ status: 'reading', name: file.name })
    try {
      const doc = await readDocument(file)
      if (seq === readSeq.current) setAttachment({ status: 'ready', name: doc.name, doc })
    } catch (e) {
      if (seq === readSeq.current)
        setAttachment({ status: 'error', name: file.name, error: e instanceof Error ? e.message : 'That file could not be read.' })
    }
    textareaRef.current?.focus({ preventScroll: true })
  }
  function removeAttachment() {
    readSeq.current++
    setAttachment(null)
  }

  function fitTextarea() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // Dictation into the composer.
  const dictationBase = useRef('')
  const dictation = useDictation((text, final) => {
    setInputValue(`${dictationBase.current}${dictationBase.current ? ' ' : ''}${text}`)
    if (final) dictationBase.current = ''
    requestAnimationFrame(fitTextarea)
  })

  // -------------------------------------------------------------------------
  // Bot config
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    setIsLoadingConfig(true)
    getAiMentorConfig(botId)
      .then((config) => {
        if (cancelled) return
        setBotConfig(config)
        if (config.greeting) setMessages([{ id: makeId(), text: config.greeting, isUser: false, isGreeting: true }])
      })
      .catch(() => {
        // Leave the config empty; the thread shows Try again.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConfig(false)
      })
    return () => {
      cancelled = true
    }
  }, [botId, configAttempt])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  // -------------------------------------------------------------------------
  // Send (SSE streamed through Hadafi's server)
  // -------------------------------------------------------------------------

  async function sendMessage(text: string) {
    const typed = text.trim()
    const doc = attachment?.status === 'ready' ? attachment.doc : null
    if ((!typed && !doc) || isStreaming || !botConfig || attachment?.status === 'reading') return
    const message = typed || DOC_DEFAULT_MESSAGE

    const userMsg: Message = { id: makeId(), text: message, isUser: true, docName: doc?.name }
    const botMsgId = makeId()
    const botMsg: Message = { id: botMsgId, text: '', isUser: false, isStreaming: true }
    const setBot = (patch: Partial<Message>) => setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, ...patch } : m)))

    setMessages((prev) => [...prev, userMsg, botMsg])
    setInputValue('')
    if (doc) setAttachment(null)
    dictation.stop()
    dictationBase.current = ''
    setHasUserSentMessage(true)
    setIsStreaming(true)
    readAloud.stop()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const abort = new AbortController()
    abortRef.current = abort
    let accumulated = ''
    try {
      const response = await streamAiMentorChat(
        botId,
        { message, sessionId, ...(doc ? { document: { name: doc.name, text: doc.text, truncated: doc.truncated } } : {}) },
        abort.signal,
      )

      if (!response.ok || !response.body) {
        // The server's own words (rate limits, an unavailable mentor), else a plain fallback.
        const body = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null
        const msg = typeof body?.error?.message === 'string' && response.status !== 422 ? body.error.message : REPLY_FAILED
        setBot({ text: msg, isStreaming: false, isGreeting: true })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(raw)
          } catch {
            continue
          }
          // The bot's own error text can be technical; the learner gets a plain one.
          if (parsed.type === 'error') {
            setBot({ text: accumulated ? splitReply(accumulated).text : REPLY_FAILED, isStreaming: false })
            return
          }
          // Reasoning and tool activity are not part of the answer.
          if (parsed.type === 'thinking' || parsed.type === 'toolCall' || parsed.type === 'toolResponse') continue
          if (typeof parsed.content === 'string') {
            accumulated += parsed.content
            setBot({ text: splitReply(accumulated).text, isStreaming: true })
          }
        }
      }

      const reply = splitReply(accumulated)
      setBot({ text: reply.text || REPLY_FAILED, suggestions: reply.suggestions, isStreaming: false })
    } catch {
      if (abort.signal.aborted) {
        const partial = splitReply(accumulated).text
        if (partial) setBot({ text: partial, isStreaming: false })
        else setMessages((prev) => prev.filter((m) => m.id !== botMsgId))
      } else {
        setBot({ text: "Sorry, I couldn't connect right now. Please try again.", isStreaming: false })
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      setIsStreaming(false)
    }
  }

  function stopReply() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void sendMessage(inputValue)
    }
  }

  const docReady = attachment?.status === 'ready'
  const canSend = !isStreaming && (inputValue.trim().length > 0 || docReady) && attachment?.status !== 'reading' && Boolean(botConfig)
  const lastMentorId = [...messages].reverse().find((m) => !m.isUser)?.id
  const showThread = !isLoadingConfig && (!botConfig || botConfig.active)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-ui-bg">
      <style>{`
        @keyframes mentorBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="mentorBounce"] { animation: none !important; }
        }
      `}</style>

      <header className="flex flex-shrink-0 items-center gap-3 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
        <Link
          href="/dashboard/ai-mentors"
          aria-label="All AI mentors"
          title="All AI mentors"
          className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0')}
        >
          <ArrowLeft className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
        </Link>
        <MentorMark view={view} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">{displayName}</h1>
          <p className="truncate text-[13px] text-ui-muted">
            {specialty}
            {(view?.description ?? description) ? `. ${view?.description ?? description}` : ''}
          </p>
        </div>
        <span className="hidden flex-shrink-0 items-center gap-2 text-[13px] font-semibold text-ui-muted sm:inline-flex" aria-live="polite">
          <span className={cn('h-2 w-2 rounded-full', isStreaming ? 'bg-[#d97706]' : 'bg-ui-brand')} aria-hidden />
          {isStreaming ? 'Thinking' : 'Online, 24/7'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Thread */}
          <div className="relative min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Chat messages">
            <div className="mx-auto max-w-[840px] px-4 pb-4 pt-4 sm:px-8 sm:pt-7">
              {isLoadingConfig && (
                <div className="flex items-center justify-center gap-3 pt-10" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-ui-brand-text" aria-hidden />
                  <p className="text-sm text-ui-muted">Loading {displayName}</p>
                </div>
              )}
              {!isLoadingConfig && botConfig && !botConfig.active && (
                <EmptyState
                  title={`${displayName} is resting right now`}
                  body="This AI mentor will be back soon. In the meantime, try one of the other mentors."
                  action={
                    <Link href="/dashboard/ai-mentors" className={btn({ variant: 'secondary', size: 'md' })}>
                      All AI mentors
                    </Link>
                  }
                />
              )}
              {!isLoadingConfig && !botConfig && (
                <EmptyState
                  title={`${displayName} could not be reached`}
                  body="Check your connection and try again."
                  action={
                    <button type="button" onClick={() => setConfigAttempt((n) => n + 1)} className={btn({ variant: 'secondary', size: 'md' })}>
                      Try again
                    </button>
                  }
                />
              )}
              {showThread && botConfig && messages.length > 0 && (
                <p className="mb-4 text-center text-xs font-semibold text-ui-muted">Today</p>
              )}
              {showThread &&
                botConfig &&
                messages.map((m, i) =>
                  m.isUser ? (
                    <LearnerTurn key={m.id} message={m} />
                  ) : (
                    <MentorTurn
                      key={m.id}
                      view={view}
                      message={m}
                      isLast={m.id === lastMentorId}
                      readAloud={readAloud}
                      onSuggest={(q) => void sendMessage(q)}
                      busy={isStreaming}
                      report={
                        <ReportAnswerButton
                          variant="icon"
                          surface={`mentor:${view?.slug ?? 'ai-mentor'}`}
                          reply={m.text}
                          question={messages.slice(0, i).reverse().find((x) => x.isUser)?.text}
                          excerpt={excerptBefore(messages.slice(0, i).map((x) => ({ role: x.isUser ? 'learner' : 'ai', text: x.text })))}
                          conversation={sessionId}
                        />
                      }
                    />
                  ),
                )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Ice-breakers + composer */}
          {botConfig?.active && !isLoadingConfig && (
            <div className="flex-shrink-0 px-4 pb-4 pt-2 sm:px-8 sm:pb-[18px]">
              <div className="mx-auto max-w-[776px]">
                {!hasUserSentMessage && starters.length > 0 && (
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2.5 sm:flex-wrap" role="group" aria-label="Suggested questions">
                    {starters.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        disabled={isStreaming}
                        className={cn(chipClass, 'shrink-0 whitespace-nowrap')}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {attachment && (
                  <div
                    className={cn(
                      'mb-2 flex items-center gap-2.5 rounded-xl border bg-ui-surface px-3 py-2',
                      attachment.status === 'error' ? 'border-ui-danger' : 'border-ui-line',
                    )}
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-ui-surface-2 text-ui-muted"
                      aria-hidden
                    >
                      {attachment.status === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ui-text">{attachment.name}</span>
                      <span className={cn('block text-xs', attachment.status === 'error' ? 'text-ui-danger' : 'truncate text-ui-muted')}>
                        {attachment.status === 'reading'
                          ? 'Reading…'
                          : attachment.status === 'error'
                            ? attachment.error
                            : attachment.doc.truncated
                              ? `Ready${attachment.doc.pages ? ` · ${attachment.doc.pages} page${attachment.doc.pages === 1 ? '' : 's'}` : ''} · The mentor reads the first part`
                              : `Ready${attachment.doc.pages ? ` · ${attachment.doc.pages} page${attachment.doc.pages === 1 ? '' : 's'}` : ''}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand"
                      onClick={removeAttachment}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
                <div
                  className="flex items-end gap-1.5 rounded-[14px] border border-ui-line bg-ui-surface p-1.5 shadow-ui focus-within:border-ui-brand"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    if (!e.dataTransfer.files.length) return
                    e.preventDefault()
                    void pickFile(e.dataTransfer.files[0])
                  }}
                >
                  <button
                    type="button"
                    className={cn(iconBtnClass, 'text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text')}
                    onClick={() => fileRef.current?.click()}
                    aria-label={`Share a document with ${displayName}`}
                    title={`Share a document (${DOCUMENT_HINT})`}
                  >
                    <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    hidden
                    onChange={(e) => {
                      void pickFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      fitTextarea()
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={docReady ? `Ask about ${attachment.name}` : `Message ${displayName}`}
                    rows={1}
                    aria-label={`Message ${displayName}`}
                    className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] text-ui-text outline-none placeholder:text-ui-muted"
                  />
                  {dictation.supported && (
                    <button
                      type="button"
                      className={cn(
                        iconBtnClass,
                        dictation.listening ? 'bg-ui-brand-soft text-ui-brand-text' : 'text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
                      )}
                      aria-pressed={dictation.listening}
                      aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
                      title={dictation.listening ? 'Stop dictation' : 'Dictate'}
                      onClick={() => {
                        if (dictation.listening) dictation.stop()
                        else {
                          dictationBase.current = inputValue.trim()
                          dictation.start()
                        }
                      }}
                    >
                      <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={isStreaming ? stopReply : () => void sendMessage(inputValue)}
                    disabled={!isStreaming && !canSend}
                    aria-label={isStreaming ? 'Stop' : 'Send message'}
                    title={isStreaming ? 'Stop' : 'Send message'}
                    className={cn(iconBtnClass, 'bg-ui-brand text-white hover:bg-ui-brand-hover')}
                  >
                    {isStreaming ? (
                      <Square className="h-3 w-3" fill="currentColor" aria-hidden />
                    ) : (
                      <Send className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
                    )}
                  </button>
                </div>
                {dictation.blocked ? (
                  <p className="mt-1.5 text-center text-xs text-ui-muted" role="status">
                    Microphone access is blocked. Allow it in your browser to dictate.
                  </p>
                ) : (
                  <p className="mt-2 select-none text-center text-xs text-ui-muted">
                    AI mentors can make mistakes. Always verify important information.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <MentorRail view={view} name={displayName} specialty={specialty} description={view?.description ?? description} />
      </div>
    </div>
  )
}
