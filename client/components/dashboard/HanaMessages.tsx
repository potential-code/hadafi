'use client'

/**
 * Chat messages for Ask Hana (ported from SMEEP's chat studio).
 *
 * Hana's turns sit on the page beside her portrait, the learner's are solid
 * magenta bubbles; cards and chips line up with Hana's text (the `.hana-lead`
 * indent). Reuses the pill parsing and send refs from chat-components so
 * option pills and suggestion chips keep working unchanged.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatUserMessageProps,
} from '@copilotkit/react-core/v2'
import { CopilotChatToolCallsView } from '@copilotkit/react-core/v2'
import { motion } from 'framer-motion'
import { parseAssistantPills, onPillClickRef } from './chat-components'
import { ChatLoadingContext } from './chat-loading-context'

export const HANA_AVATAR_SRC = '/images/redesign/hana-avatar.webp'

export function HanaPortrait({ size = 32 }: { size?: number }) {
  return (
    <img
      src={HANA_AVATAR_SRC}
      alt="Hana"
      width={size}
      height={size}
      className="flex-shrink-0 rounded-full object-cover object-top"
      style={{ width: size, height: size }}
    />
  )
}

export function contentToText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : ''))
      .join('')
  }
  return ''
}

// Module-level registry so a newer pill set disables the previous one.
let disablePreviousHanaPills: (() => void) | null = null

// ── Typing indicator ──────────────────────────────────────────────────────────

export function HanaTypingIndicator() {
  return (
    <div className="mb-4 flex items-start gap-2.5" style={{ animation: 'hana-fadeup 0.24s ease both' }} role="status" aria-label="Hana is replying">
      <HanaPortrait />
      <div className="hana-bubble hana-typing flex items-center gap-1.5 !py-[18px]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-ui-muted"
            animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Assistant message ─────────────────────────────────────────────────────────

/**
 * Actions under each finished reply (copy, read aloud, try again). A surface
 * opts in by providing a renderer; without one, replies show no actions.
 */
export type HanaReplyActionsRenderer = (reply: {
  id: string
  text: string
  isLast: boolean
  /** The turns before this answer, oldest first (for "report this answer"). */
  before?: { role: 'learner' | 'ai'; text: string }[]
}) => ReactNode
export const HanaReplyActions = createContext<HanaReplyActionsRenderer | null>(null)

/** Text turns before message `idx` (tool-only turns left out), for a report's excerpt. */
function turnsBefore(list: Array<{ role?: string; content?: unknown }>, idx: number) {
  return list
    .slice(Math.max(0, idx - 8), Math.max(0, idx))
    .filter((mm) => mm.role === 'user' || mm.role === 'assistant')
    .map((mm) => ({ role: mm.role === 'user' ? ('learner' as const) : ('ai' as const), text: contentToText(mm.content).replace(/<!--[\s\S]*?-->/g, '').trim() }))
    .filter((t) => t.text)
}

const PROSE_CLASS =
  'hana-prose [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_td]:border-t [&_td]:border-ui-line [&_td]:px-2 [&_td]:py-1 [&_code]:rounded [&_code]:bg-ui-surface-2 [&_code]:px-1'

export function HanaAssistantMessage({ message, messages }: CopilotChatAssistantMessageProps) {
  const m = message as { content?: unknown; toolCalls?: unknown[]; id?: string } | undefined
  const content = contentToText(m?.content)
  const hasText = content.trim().length > 0
  const hasToolCalls = !!m?.toolCalls?.length
  const { prose, pills, label, multiSelect, isSuggest } = parseAssistantPills(content)
  const hasPills = pills.length > 0

  const [pillsDisabledByNewer, setPillsDisabledByNewer] = useState(false)
  const [selectedPills, setSelectedPills] = useState<Set<number>>(new Set())
  const streaming = useContext(ChatLoadingContext)
  const renderActions = useContext(HanaReplyActions)
  const hasRegisteredPillsRef = useRef(false)

  useEffect(() => {
    if (!hasPills || hasRegisteredPillsRef.current) return
    hasRegisteredPillsRef.current = true
    disablePreviousHanaPills?.()
    disablePreviousHanaPills = () => setPillsDisabledByNewer(true)
  }, [hasPills])

  const thisId = m?.id
  const lastId = (messages as Array<{ id?: string }> | undefined)?.[(messages?.length ?? 0) - 1]?.id
  const isStale = Boolean(thisId && lastId && thisId !== lastId)
  // Reply actions: once per answer (on its last shown text, not the greeting),
  // and only after the answer has finished.
  const answerList = (messages as Array<{ id?: string; role?: string; content?: unknown; toolCalls?: unknown[] }> | undefined) ?? []
  const answerIdx = thisId ? answerList.findIndex((mm) => mm.id === thisId) : -1
  const lastUserIdx = answerList.map((mm) => mm.role).lastIndexOf('user')
  let laterTextInTurn = false
  for (let k = answerIdx + 1; answerIdx >= 0 && k < answerList.length; k++) {
    const next = answerList[k]
    if (next?.role === 'user') break
    // A later text with tool calls is a repeated lead-in, and isn't shown.
    if (next?.role === 'assistant' && !next.toolCalls?.length && contentToText(next.content).trim()) {
      laterTextInTurn = true
      break
    }
  }
  const inLatestTurn = answerIdx > lastUserIdx
  // Not the opening greeting: something the learner said, or an earlier
  // answer, comes before it.
  const before = answerIdx > 0 ? answerList.slice(0, answerIdx) : []
  const afterGreeting = before.some(
    (mm) => mm.role === 'user' || (mm.role === 'assistant' && !mm.toolCalls?.length && contentToText(mm.content).trim()),
  )
  const showActions = afterGreeting && !laterTextInTurn && !(streaming && inLatestTurn)
  const pillsDisabled = streaming || pillsDisabledByNewer || isStale

  if (!hasText && !hasToolCalls) return null

  // One voice line per run: an agent answering across several tool-call turns
  // tends to restate its lead-in on each turn. If an earlier assistant message
  // in this run already spoke, render only this message's tool calls.
  let suppressRepeatedLeadIn = false
  if (hasText && hasToolCalls && messages && thisId) {
    const list = messages as Array<{ id?: string; role?: string; content?: unknown }>
    const idx = list.findIndex((mm) => mm.id === thisId)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = list[i]
      if (prev?.role === 'user') break
      if (prev?.role === 'assistant' && contentToText(prev.content).trim().length > 0) {
        suppressRepeatedLeadIn = true
        break
      }
    }
  }

  const toolCalls = hasToolCalls && (
    <div className="hana-lead">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
    </div>
  )

  if (!hasText || suppressRepeatedLeadIn) return <>{toolCalls}</>

  // Follow-up suggestion chips: no portrait, just a row of chips.
  if (isSuggest) {
    return (
      <>
        <div className="hana-lead mb-4 flex flex-wrap gap-1.5" style={{ animation: 'hana-fadeup 0.24s ease both' }}>
          {pills.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              className="hana-chip"
              disabled={pillsDisabled}
              onClick={() => onPillClickRef.current?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        {toolCalls}
      </>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-2.5" style={{ animation: 'hana-fadeup 0.24s ease both' }}>
        <HanaPortrait />
        <div className="min-w-0 flex-1">
          <div className="hana-bubble w-fit" dir="auto">
            <div className={PROSE_CLASS}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{hasPills ? prose : content}</ReactMarkdown>
            </div>
          </div>
          {hasPills && (
            <div className="mt-3">
              {label && <p className="mb-1.5 text-[13px] font-semibold text-ui-muted">{label}</p>}
              <div className="flex flex-wrap gap-1.5">
                {pills.map((pillText, index) => {
                  const isSelected = selectedPills.has(index)
                  return (
                    <button
                      key={`${index}-${pillText}`}
                      type="button"
                      className="hana-chip"
                      aria-pressed={multiSelect ? isSelected : undefined}
                      style={
                        isSelected
                          ? { borderColor: 'var(--ui-brand)', background: 'var(--ui-brand-soft)', color: 'var(--ui-brand-text)' }
                          : undefined
                      }
                      disabled={pillsDisabled}
                      onClick={() => {
                        if (multiSelect) {
                          setSelectedPills((prev) => {
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
              {multiSelect && (
                <button
                  type="button"
                  className="hana-next mt-2.5"
                  disabled={pillsDisabled || selectedPills.size === 0}
                  onClick={() => {
                    const chosen = pills.filter((_, i) => selectedPills.has(i))
                    onPillClickRef.current?.(chosen.join(', '))
                  }}
                >
                  Confirm selection{selectedPills.size > 0 ? ` (${selectedPills.size})` : ''}
                </button>
              )}
            </div>
          )}
          {renderActions && showActions && (
            <div className="hana-reply-actions">{renderActions({ id: thisId!, text: hasPills ? prose : content, isLast: inLatestTurn, before: turnsBefore(answerList, answerIdx) })}</div>
          )}
        </div>
      </div>
      {toolCalls}
    </>
  )
}

// ── User message ──────────────────────────────────────────────────────────────

export function HanaUserMessage({ message }: CopilotChatUserMessageProps) {
  // Hidden notes (HTML comments) are for Hana, not the bubble.
  const text = contentToText(message.content).replace(/\s*<!--[\s\S]*?-->/g, '').trim()
  if (!text) return null
  return (
    <motion.div
      className="mb-4 flex justify-end"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="hana-bubble-user" dir="auto">{text}</div>
    </motion.div>
  )
}
