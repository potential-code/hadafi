'use client'

import { useState, useRef, useEffect, useCallback, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatUserMessageProps,
  CopilotChatInputProps,
} from '@copilotkit/react-core/v2'
import { CopilotChatToolCallsView } from '@copilotkit/react-core/v2'
import { motion } from 'framer-motion'
import { SendHorizontal, Square, Copy, Check, RotateCcw } from 'lucide-react'
import { getUser } from '@/lib/auth'
import { ChatLoadingContext } from './chat-loading-context'

// ─── Module-level refs shared between SmeepChatInput and EmbeddedDashboardAssistant ──
//
// Written to by EmbeddedDashboardAssistant so SmeepChatInput can fire it on submit
// without needing access to the component's internal refs.
export const beforeSendRef: { current: (() => void) | null } = { current: null }

// Tracks whether the LLM is currently streaming. SmeepChatInput writes to the ref
// on every inProgress change and calls the subscriber so EmbeddedDashboardAssistant
// can update its state and propagate the value via ChatLoadingContext.
export const isChatInProgressRef = { current: false }
export const onChatInProgressChange: { current: ((v: boolean) => void) | null } = { current: null }
export const wasStoppedRef = { current: false }
export const onPillClickRef: { current: ((text: string) => void) | null } = { current: null }
// V2: onSubmitMessage from CopilotChatInput. Pill clicks use this ref so they
// go through the same submission path as typed messages.
export const copilotSendRef: { current: ((text: string) => void) | null } = { current: null }

// When a new pill set mounts it calls this to disable the previous set.
let disablePreviousPills: (() => void) | null = null

// Called at the moment a user message is sent so pills lock immediately,
// before the LLM starts streaming (which is when they'd normally disable).
export function disableActivePills() {
  disablePreviousPills?.()
}

// ─── parseAssistantPills ──────────────────────────────────────────────────────

export type ParsedMessage = { prose: string; pills: string[]; label: string; multiSelect: boolean; isSuggest: boolean }

// Single-select:  <!-- options: Choose a Business Idea -->
// Multi-select:   <!-- options-multi: Choose Key Benefits -->
// Label is optional in both forms. Without the sentinel the list renders as plain markdown.
const OPTIONS_SENTINEL_RE = /^<!-- options(-multi)?(?::\s*(.+?))?\s*-->$/
const SUGGEST_SENTINEL_RE = /^<!-- suggest:\s*(.+?)\s*-->$/m

export function parseAssistantPills(content: string): ParsedMessage {
  const empty = (c: string): ParsedMessage => ({ prose: c, pills: [], label: '', multiSelect: false, isSuggest: false })

  // Suggest sentinel — pipe-separated, no numbered list, no prose
  if (content.includes('<!-- suggest:')) {
    const m = content.match(SUGGEST_SENTINEL_RE)
    if (m) {
      const pills = m[1].split('|').map(s => s.trim()).filter(Boolean)
      if (pills.length > 0) return { prose: '', pills, label: '', multiSelect: false, isSuggest: true }
    }
  }

  if (!content.includes('<!-- options')) return empty(content)

  const lines = content.split('\n')
  let end = lines.length - 1
  while (end >= 0 && lines[end].trim() === '') end--
  if (end < 0) return empty(content)

  const items: { lineIdx: number; text: string; num: number }[] = []
  let cursor = end
  while (cursor >= 0) {
    const line = lines[cursor].trim()
    if (line === '') break
    const m = line.match(/^(\d+)\.\s+(.+)$/)
    if (!m) break
    items.unshift({ lineIdx: cursor, text: m[2], num: parseInt(m[1], 10) })
    cursor--
  }

  if (items.length < 2) return empty(content)
  for (let i = 0; i < items.length; i++) {
    if (items[i].num !== i + 1) return empty(content)
  }
  if (items.some(it => it.text.length > 200)) return empty(content)

  // Sentinel must appear on the line immediately before the numbered block.
  let preIdx = items[0].lineIdx - 1
  while (preIdx >= 0 && lines[preIdx].trim() === '') preIdx--
  if (preIdx < 0) return empty(content)
  const sentinelMatch = lines[preIdx].trim().match(OPTIONS_SENTINEL_RE)
  if (!sentinelMatch) return empty(content)

  const multiSelect = sentinelMatch[1] === '-multi'
  const label = sentinelMatch[2]?.trim() ?? ''

  // Prose is everything before the sentinel line.
  const proseLines = lines.slice(0, preIdx)
  while (proseLines.length > 0 && proseLines[proseLines.length - 1].trim() === '') proseLines.pop()

  return { prose: proseLines.join('\n'), pills: items.map(it => it.text), label, multiSelect, isSuggest: false }
}

// ─── SmeepTypingCursor ───────────────────────────────────────────────────────

export function SmeepTypingCursor() {
  return (
    <div className="flex gap-2 items-end mb-3">
      <img
        src="/images/redesign/smeep-avatar-96.png"
        alt="Sana"
        className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0"
      />
      <div
        className="smeep-typing-bubble px-4 py-3 bg-white border border-[#f7e8f0] flex items-center gap-1.5"
        style={{ borderRadius: '14px 14px 14px 0' }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full"
            style={{ background: '#9f2063' }}
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── SmeepAssistantMessage ────────────────────────────────────────────────────

export function SmeepAssistantMessage({ message, messages }: CopilotChatAssistantMessageProps) {
  const m = message as { name?: string; content?: unknown; toolCalls?: unknown[] } | undefined

  // ── Derive content + pills before any hook so all hooks are unconditional ──
  const raw = m?.content
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : '')).join('')
        : ''
  const hasText = content.trim().length > 0
  const hasToolCalls = !!(m?.toolCalls?.length)
  const { prose, pills, label, multiSelect, isSuggest } = parseAssistantPills(content)
  const hasPills = pills.length > 0

  // ── All hooks unconditionally ─────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const [pillsDisabledByNewer, setPillsDisabledByNewer] = useState(false)
  const [selectedPills, setSelectedPills] = useState<Set<number>>(new Set())
  const streaming = useContext(ChatLoadingContext)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against React Strict Mode's double-effect invocation.
  const hasRegisteredPillsRef = useRef(false)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // When this message first gets pills, disable the previous pill set and register ours.
  useEffect(() => {
    if (!hasPills || hasRegisteredPillsRef.current) return
    hasRegisteredPillsRef.current = true
    disablePreviousPills?.()
    disablePreviousPills = () => setPillsDisabledByNewer(true)
  }, [hasPills])

  const pillsDisabled = streaming || pillsDisabledByNewer

  // ── Early returns after all hooks ─────────────────────────────────────────

  // Nothing to show at all
  if (!hasText && !hasToolCalls) return null

  // Pure tool-call message (agent called a tool with no accompanying text)
  if (!hasText) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hasPills) {
    // Plain text message — single bubble with copy button.
    return (
      <>
        <div className="flex gap-2 items-end mb-3">
          <img
            src="/images/redesign/smeep-avatar-96.png"
            alt="Sana"
            className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0"
          />
          <div
            className="smeep-bot-bubble relative px-3 pt-2 pb-6 text-[13px] text-[#1A0A12] leading-relaxed bg-white border border-[#f7e8f0]"
            style={{ borderRadius: '14px 14px 14px 0', maxWidth: '85%' }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            <button
              onClick={() => navigator.clipboard.writeText(content).then(() => {
                setCopied(true)
                if (timerRef.current) clearTimeout(timerRef.current)
                timerRef.current = setTimeout(() => setCopied(false), 3000)
              })}
              aria-label={copied ? 'Copied' : 'Copy message'}
              className="absolute bottom-1.5 right-2 flex items-center gap-1 transition-colors"
              style={{ color: copied ? '#9f2063' : 'rgba(107,114,128,0.5)' }}
            >
              {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
            </button>
          </div>
        </div>
        {hasToolCalls && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
        )}
      </>
    )
  }

  // Follow-up suggestion pills — no avatar, no bubble, just clickable pill buttons.
  if (isSuggest) {
    return (
      <>
        <div className="flex flex-col items-start gap-1.5 mb-3">
          {pills.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              className="smeep-suggestion-pill"
              disabled={pillsDisabled}
              onClick={() => onPillClickRef.current?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        {hasToolCalls && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
        )}
      </>
    )
  }

  // Message with selectable options — prose bubble (if any) + pills outside the bubble.
  return (
    <>
      <div className="flex gap-2 items-start mb-3">
        <img
          src="/images/redesign/smeep-avatar-96.png"
          alt="Sana"
          className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0 mt-0.5"
        />
        <div className="min-w-0" style={{ maxWidth: '85%' }}>
          {prose && (
            <div
              className="smeep-bot-bubble relative px-3 pt-2 pb-6 text-[13px] text-[#1A0A12] leading-relaxed bg-white border border-[#f7e8f0] mb-3"
              style={{ borderRadius: '14px 14px 14px 0' }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prose}</ReactMarkdown>
              <button
                onClick={() => navigator.clipboard.writeText(prose).then(() => {
                  setCopied(true)
                  if (timerRef.current) clearTimeout(timerRef.current)
                  timerRef.current = setTimeout(() => setCopied(false), 3000)
                })}
                aria-label={copied ? 'Copied' : 'Copy message'}
                className="absolute bottom-1.5 right-2 flex items-center gap-1 transition-colors"
                style={{ color: copied ? '#9f2063' : 'rgba(107,114,128,0.5)' }}
              >
                {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
              </button>
            </div>
          )}
          {label && (
            <p className="text-[12px] font-semibold mb-1.5" style={{ color: '#9f2063' }}>
              {label}
            </p>
          )}
          <p className="text-[11px] font-medium mb-2" style={{ color: 'rgba(159,32,99,0.45)' }}>
            {multiSelect
              ? 'Select one or more, then confirm.'
              : 'Tap to select, or type your own response below.'}
          </p>
          <div className="smeep-suggestion-pills">
            {pills.map((pillText, index) => {
              const isSelected = selectedPills.has(index)
              return (
                <button
                  key={`${index}-${pillText}`}
                  className={`smeep-suggestion-pill${isSelected ? ' smeep-suggestion-pill--selected' : ''}`}
                  disabled={pillsDisabled}
                  onClick={() => {
                    if (multiSelect) {
                      setSelectedPills(prev => {
                        const next = new Set(prev)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    } else {
                      onPillClickRef.current?.(pillText)
                    }
                  }}
                >
                  {pillText}
                </button>
              )
            })}
          </div>
          {multiSelect ? (
            <div className="flex flex-col items-start gap-1 mt-1">
              <button
                className="smeep-confirm-btn"
                disabled={pillsDisabled || selectedPills.size === 0}
                onClick={() => {
                  const chosen = pills.filter((_, i) => selectedPills.has(i))
                  onPillClickRef.current?.(chosen.join(', '))
                }}
              >
                Confirm selection{selectedPills.size > 0 ? ` (${selectedPills.size})` : ''}
              </button>
              <button
                className="smeep-more-options-btn"
                disabled={pillsDisabled}
                onClick={() => onPillClickRef.current?.('Generate more options')}
              >
                <RotateCcw size={11} strokeWidth={2} />
                Generate more options
              </button>
            </div>
          ) : (
            <button
              className="smeep-more-options-btn"
              disabled={pillsDisabled}
              onClick={() => onPillClickRef.current?.('Generate more options')}
            >
              <RotateCcw size={11} strokeWidth={2} />
              Generate more options
            </button>
          )}
        </div>
      </div>
      {hasToolCalls && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
      )}
    </>
  )
}

// ─── SmeepUserMessage ─────────────────────────────────────────────────────────

export function SmeepUserMessage({ message }: CopilotChatUserMessageProps) {
  const user = getUser()
  const initial = (user?.fullName ?? user?.email ?? 'U')[0].toUpperCase()
  const raw = message.content
  const text = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.map((p: { type?: string; text?: string }) => p?.type === 'text' ? (p.text ?? '') : '').join('')
      : ''

  return (
    <motion.div
      className="flex gap-2 items-end flex-row-reverse mb-3"
      initial={{ opacity: 0, y: 12, x: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.72 }}
    >
      <motion.div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none"
        style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.72, delay: 0.04 }}
      >
        {initial}
      </motion.div>
      <motion.div
        className="px-3 py-2 text-[13px] text-white leading-relaxed whitespace-pre-wrap"
        style={{
          background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)',
          borderRadius: '14px 14px 0 14px',
          maxWidth: '78%',
          transformOrigin: 'bottom right',
        }}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.72, delay: 0.02 }}
      >
        {text}
      </motion.div>
    </motion.div>
  )
}

// ─── SmeepChatInput ───────────────────────────────────────────────────────────

export function SmeepChatInput({ isRunning, onSubmitMessage, onStop }: CopilotChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    isChatInProgressRef.current = isRunning ?? false
    onChatInProgressChange.current?.(isRunning ?? false)
  }, [isRunning])

  useEffect(() => {
    copilotSendRef.current = onSubmitMessage ?? null
    return () => { copilotSendRef.current = null }
  }, [onSubmitMessage])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if (!text || isRunning) return
    wasStoppedRef.current = false
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    disablePreviousPills?.()
    beforeSendRef.current?.()
    onSubmitMessage?.(text)
  }, [value, isRunning, onSubmitMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isRunning) handleSend()
      }
    },
    [isRunning, handleSend],
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const canAct = isRunning || value.trim().length > 0

  return (
    <div className="px-3 pb-3 pt-2" style={{ pointerEvents: 'auto' }}>
      <div className="smeep-chat-input-wrap flex items-end gap-2 px-3 py-2 bg-[#FDF5F9] border border-[#f7e8f0] rounded-2xl">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything…"
          rows={1}
          className="smeep-chat-textarea flex-1 bg-transparent outline-none resize-none text-[13px] text-[#1A0A12] leading-snug placeholder:text-[#6B7280]/50 min-w-0"
          style={{ minHeight: '20px', maxHeight: '120px', fontFamily: 'inherit' }}
        />
        <button
          onClick={isRunning ? () => { wasStoppedRef.current = true; onStop?.() } : handleSend}
          disabled={!canAct}
          aria-label={isRunning ? 'Stop' : 'Send'}
          className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 self-end transition-opacity disabled:opacity-30"
          style={
            canAct
              ? { background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }
              : { background: 'var(--smeep-btn-idle-bg, #f7e8f0)' }
          }
        >
          {isRunning ? (
            <Square size={9} fill="white" className="text-white opacity-85" />
          ) : (
            <SendHorizontal size={13} strokeWidth={2.5} className="text-white" />
          )}
        </button>
      </div>
      <p className="smeep-chat-hint text-[10px] text-center mt-1.5 select-none text-gray-500/45">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
