'use client'

/**
 * Copy, read aloud and try again under Hana's answers (ported from SMEEP).
 * HanaAssistantMessage decides which replies get them (finished answers,
 * never the greeting).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, RotateCcw, Square, Volume2 } from 'lucide-react'
import type { ReadAloud } from './useHanaVoice'
import { cn } from '@/lib/utils'

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
