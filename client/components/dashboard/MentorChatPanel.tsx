'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, User } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BotConfig {
  _id: string
  system: string
  name: string
  greeting: string
  active: boolean
  imageName?: string
  prePrompt?: string[]
}

interface Message {
  id: string
  text: string
  timestamp: Date
  isUser: boolean
  isStreaming?: boolean
}

interface Props {
  botId: string
  name: string
  specialty: string
  avatar: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.potential.com'

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

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 h-4" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          style={{
            animation: 'mentorBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  )
}

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy message'}
      className={cn(
        'absolute top-2 right-2 p-1 rounded-md transition-all duration-150',
        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        'bg-white/80 hover:bg-white text-[#9f2063] border border-[#9f2063]/20 shadow-sm',
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MentorChatPanel({ botId, name, specialty, avatar }: Props) {
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Stable session id — generated once
  const sessionId = useRef(`session-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const avatarUrl = botConfig?.imageName
    ? `${API_BASE}/static/mentors/${botConfig.imageName}`
    : avatar

  const displayName = botConfig?.name ?? name
  const prePrompts = botConfig?.prePrompt ?? []

  // -------------------------------------------------------------------------
  // Fetch bot config on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function fetchConfig() {
      setIsLoadingConfig(true)
      try {
        const res = await fetch(`${API_BASE}/api/admin/bot/${botId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const config: BotConfig = await res.json()
        if (cancelled) return
        setBotConfig(config)
        // Seed greeting as first bot message
        if (config.greeting) {
          setMessages([
            {
              id: makeId(),
              text: config.greeting,
              timestamp: new Date(),
              isUser: false,
            },
          ])
        }
      } catch {
        // Leave messages empty; the UI will show a fallback
      } finally {
        if (!cancelled) setIsLoadingConfig(false)
      }
    }

    fetchConfig()
    return () => {
      cancelled = true
    }
  }, [botId])

  // -------------------------------------------------------------------------
  // Scroll to bottom on new messages
  // -------------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // -------------------------------------------------------------------------
  // Textarea auto-resize
  // -------------------------------------------------------------------------

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value)
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming || !botConfig) return

    const userMsg: Message = {
      id: makeId(),
      text: text.trim(),
      timestamp: new Date(),
      isUser: true,
    }

    const botMsgId = makeId()
    const botMsg: Message = {
      id: botMsgId,
      text: '',
      timestamp: new Date(),
      isUser: false,
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, botMsg])
    setInputValue('')
    setHasUserSentMessage(true)
    setIsStreaming(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const response = await fetch(`${API_BASE}/agent/chatbot/${botId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), sessionId: sessionId.current }),
      })

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

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
          try { parsed = JSON.parse(raw) } catch { continue }

          if (parsed.type === 'error') {
            const errText = typeof parsed.message === 'string' ? parsed.message : 'Something went wrong.'
            setMessages((prev) =>
              prev.map((m) => m.id === botMsgId ? { ...m, text: errText, isStreaming: false } : m),
            )
            return
          }

          if (typeof parsed.content === 'string') {
            accumulated += parsed.content
            setMessages((prev) =>
              prev.map((m) => m.id === botMsgId ? { ...m, text: accumulated, isStreaming: true } : m),
            )
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === botMsgId ? { ...m, isStreaming: false } : m),
      )
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? { ...m, text: "Sorry, I couldn't connect right now. Please try again.", isStreaming: false }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col h-full bg-[#FDF5F9] items-center justify-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: '#9f2063', borderTopColor: 'transparent' }}
          aria-label="Loading mentor…"
        />
        <p className="text-sm text-[#6B7280]">Loading mentor…</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Inactive bot state
  // -------------------------------------------------------------------------

  if (botConfig && !botConfig.active) {
    return (
      <div className="flex flex-col h-full bg-[#FDF5F9] items-center justify-center gap-4 px-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: '#f7e8f0' }}
        >
          <span className="text-2xl" role="img" aria-label="offline">
            💤
          </span>
        </div>
        <p className="text-[#1A0A12] font-semibold text-lg">{displayName} is currently offline</p>
        <p className="text-[#6B7280] text-sm max-w-xs">
          This AI mentor is not available right now. Please check back later or try another mentor.
        </p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main chat UI
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Bounce animation keyframes — injected once */}
      <style>{`
        @keyframes mentorBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>

      <div className="flex flex-col h-full" style={{ background: '#FDF5F9' }}>
        {/* ---------------------------------------------------------------- */}
        {/* HEADER                                                            */}
        {/* ---------------------------------------------------------------- */}
        <header
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ background: '#9f2063' }}
        >
          <div className="relative shrink-0">
            <Image
              src={avatarUrl}
              alt={displayName}
              width={44}
              height={44}
              className="rounded-full object-cover ring-2 ring-white/30"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm leading-tight truncate">{displayName}</p>
            <p className="text-white/70 text-xs truncate">{specialty}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: isStreaming ? '#fbbf24' : '#22c55e' }}
              aria-hidden="true"
            />
            <span className="text-white/80 text-xs">
              {isStreaming ? 'Thinking…' : 'Online'}
            </span>
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* MESSAGE LIST                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.map((message) =>
            message.isUser ? (
              /* User message */
              <div key={message.id} className="flex flex-col items-end gap-1">
                <div className="flex items-end gap-2 max-w-[75%]">
                  <div
                    className="rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white leading-relaxed"
                    style={{ background: '#9f2063' }}
                  >
                    {message.text}
                  </div>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: '#f7e8f0' }}
                    aria-hidden="true"
                  >
                    <User className="w-4 h-4" style={{ color: '#9f2063' }} />
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] pr-10">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ) : (
              /* Bot message */
              <div key={message.id} className="flex flex-col items-start gap-1">
                <div className="flex items-end gap-2">
                  <div className="shrink-0" aria-hidden="true">
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  </div>
                  <div
                    className="group relative max-w-[78%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed border"
                    style={{
                      background: '#ffffff',
                      borderColor: 'rgba(159,32,99,0.3)',
                      color: '#1A0A12',
                    }}
                  >
                    {message.isStreaming && message.text === '' ? (
                      <TypingDots />
                    ) : (
                      <>
                        <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#9f2063' }}
                                  className="underline underline-offset-2"
                                >
                                  {children}
                                </a>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote
                                  className="pl-3 my-2 italic"
                                  style={{ borderLeft: '3px solid #9f2063', color: '#6B7280' }}
                                >
                                  {children}
                                </blockquote>
                              ),
                              img: () => null,
                              code: ({ children, className }) => {
                                const isBlock = className?.includes('language-')
                                return isBlock ? (
                                  <code className={cn('block bg-gray-100 rounded p-2 text-xs overflow-x-auto', className)}>
                                    {children}
                                  </code>
                                ) : (
                                  <code className="bg-gray-100 rounded px-1 py-0.5 text-xs">
                                    {children}
                                  </code>
                                )
                              },
                            }}
                          >
                            {processMarkdown(message.text)}
                          </ReactMarkdown>
                        </div>
                        {!message.isStreaming && <CopyButton text={message.text} />}
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] pl-10">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ),
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* ICE BREAKER CHIPS                                                 */}
        {/* ---------------------------------------------------------------- */}
        {!hasUserSentMessage && prePrompts.length > 0 && (
          <div
            className="px-4 pb-3 flex flex-wrap gap-2"
            style={{ background: '#f7e8f0' }}
            aria-label="Suggested questions"
          >
            {prePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => sendMessage(prompt)}
                disabled={isStreaming}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 hover:bg-[#9f2063] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: '#ffffff',
                  color: '#9f2063',
                  borderColor: '#9f2063',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* INPUT BAR                                                         */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="px-4 pt-3 pb-4 shrink-0 rounded-b-3xl"
          style={{ background: '#f7e8f0' }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${displayName}…`}
              disabled={isStreaming}
              rows={1}
              aria-label="Message input"
              className={cn(
                'flex-1 resize-none rounded-2xl border px-4 py-3 text-sm leading-relaxed',
                'bg-white text-[#1A0A12] placeholder:text-[#6B7280]',
                'focus:outline-none focus:ring-2 transition-shadow duration-150',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'min-h-[44px] max-h-[200px]',
              )}
              style={{
                borderColor: 'rgba(159,32,99,0.3)',
                // @ts-ignore — focus ring via CSS variable not supported via inline style
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#9f2063'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(159,32,99,0.3)'
              }}
            />
            <button
              onClick={() => sendMessage(inputValue)}
              disabled={isStreaming || !inputValue.trim() || !botConfig}
              aria-label="Send message"
              className={cn(
                'shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150',
                'text-white shadow-sm',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'hover:not-disabled:scale-105 active:scale-95',
              )}
              style={{ background: '#9f2063' }}
            >
              {/* Simple send arrow */}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <path d="M3.105 3.105a.75.75 0 0 1 .894-.105l13.5 7.5a.75.75 0 0 1 0 1.31l-13.5 7.5a.75.75 0 0 1-1.05-.978L4.927 12H10a.75.75 0 0 0 0-1.5H4.927L2.949 4.184a.75.75 0 0 1 .156-.08z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#6B7280]">
            AI mentors can make mistakes. Always verify important information.
          </p>
        </div>
      </div>
    </>
  )
}
