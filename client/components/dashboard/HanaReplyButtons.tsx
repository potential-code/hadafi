'use client'

/**
 * Copy, read aloud and try again under Hana's answers (ported from SMEEP).
 * HanaAssistantMessage decides which replies get them (finished answers,
 * never the greeting). Every Hana chat gets copy and read aloud by default;
 * wrap a chat in <HanaReplyActionsProvider reportSurface="..."> to add
 * "report this answer" (learner chats), or give HanaReplyActions `null` to
 * turn the actions off.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Loader2, RotateCcw, Square, Volume2 } from 'lucide-react'
import { useReadAloud, type ReadAloud } from './useHanaVoice'
import { HanaReplyActions, type HanaReplyActionsRenderer } from './hanaReplyActions'
import { ReportAnswerButton, excerptBefore } from './ReportAnswerButton'
import { cn } from '@/lib/utils'
import './hana-studio.css'

/** Markdown to the plain text a reader would copy (and hear). */
export function replyPlainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```\w*\n?([\s\S]*?)```/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function HanaReplyButtons({
  id,
  text,
  isLast,
  readAloud,
  onRegenerate,
  busy,
}: {
  id: string
  text: string
  isLast: boolean
  readAloud: ReadAloud
  /** Shown on the latest answer only, when the surface can redo a reply. */
  onRegenerate?: () => void
  busy?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const plain = replyPlainText(text)
  const copy = useCallback(async () => {
    if (!(await copyText(plain))) return
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }, [plain])

  const loading = readAloud.loadingId === id
  const playing = readAloud.playingId === id
  const speak = () => (loading || playing ? readAloud.stop() : void readAloud.play(id, plain))

  if (!plain) return null
  return (
    <>
      <button type="button" className="hana-action" onClick={copy} aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'}>
        {copied ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
      </button>
      <button
        type="button"
        className={cn('hana-action', (loading || playing) && 'is-on')}
        onClick={speak}
        aria-pressed={loading || playing}
        aria-label={loading || playing ? 'Stop reading' : 'Read aloud'}
        title={loading || playing ? 'Stop reading' : 'Read aloud'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : playing ? (
          <Square className="h-3 w-3" fill="currentColor" aria-hidden />
        ) : (
          <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {isLast && onRegenerate && (
        <button type="button" className="hana-action" onClick={onRegenerate} disabled={busy} aria-label="Try again" title="Try again">
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </>
  )
}

/** What a chat without its own renderer shows: copy and read aloud. */
export function DefaultHanaReplyActions({ id, text, isLast }: { id: string; text: string; isLast: boolean }) {
  const readAloud = useReadAloud()
  return <HanaReplyButtons id={id} text={text} isLast={isLast} readAloud={readAloud} />
}

/**
 * Copy and read aloud under every finished answer in this chat, plus "report
 * this answer" when `reportSurface` names the chat (e.g. "examiner",
 * "tutor"); leave it out for admins' own tools. `onRegenerate` adds try
 * again on the latest answer.
 */
export function HanaReplyActionsProvider({
  children,
  reportSurface,
  conversation,
  onRegenerate,
  busy,
}: {
  children: ReactNode
  reportSurface?: string
  /** The chat's id in this browser (thread or session), sent with a report. */
  conversation?: string
  onRegenerate?: () => void
  busy?: boolean
}) {
  const readAloud = useReadAloud()
  const render = useMemo<HanaReplyActionsRenderer>(
    () =>
      ({ before, ...reply }) => (
        <>
          <HanaReplyButtons
            {...reply}
            readAloud={readAloud}
            onRegenerate={
              onRegenerate
                ? () => {
                    readAloud.stop()
                    onRegenerate()
                  }
                : undefined
            }
            busy={busy}
          />
          {reportSurface && (
            <ReportAnswerButton
              surface={reportSurface}
              reply={replyPlainText(reply.text)}
              question={[...(before ?? [])].reverse().find((t) => t.role === 'learner')?.text}
              excerpt={excerptBefore(before ?? [])}
              conversation={conversation}
            />
          )}
        </>
      ),
    [readAloud, onRegenerate, busy, reportSurface, conversation],
  )
  return <HanaReplyActions.Provider value={render}>{children}</HanaReplyActions.Provider>
}
