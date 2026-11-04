'use client'

/**
 * The composer for Ask Hana (ported from SMEEP): one bordered input card with
 * a dictation mic (browser speech recognition, shown only where the browser
 * supports it) and a magenta send button. Wires the same shared refs as the
 * other chat composers so pill clicks and loading state keep flowing through
 * one path.
 *
 * Options come from props or a surrounding <HanaComposerOptions.Provider>
 * (for surfaces that hand the component to CopilotChat's `input` slot and
 * can't pass props).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CopilotChatInputProps } from '@copilotkit/react-core/v2'
import { Mic, Send, Square } from 'lucide-react'
import {
  beforeSendRef,
  chatPlaceholderRef,
  copilotSendRef,
  disableActivePills,
  isChatInProgressRef,
  onChatInProgressChange,
  wasStoppedRef,
} from './chat-components'
import { useDictation } from './useHanaVoice'

export interface HanaComposerOptionsValue {
  placeholder?: string
  /** Show the dictation mic where the browser supports it (default true). */
  dictation?: boolean
  /** Content shown just above the input box (e.g. shortcut menus). */
  above?: ReactNode
}

export const HanaComposerOptions = createContext<HanaComposerOptionsValue>({})

export function HanaChatInput({
  isRunning,
  onSubmitMessage,
  onStop,
  placeholder,
  dictation: dictationProp,
}: CopilotChatInputProps & { placeholder?: string; dictation?: boolean }) {
  const options = useContext(HanaComposerOptions)
  const showMic = dictationProp ?? options.dictation ?? true
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const base = useRef('')

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [])

  const dictation = useDictation((text, final) => {
    setValue(`${base.current}${base.current ? ' ' : ''}${text}`)
    if (final) base.current = ''
    requestAnimationFrame(resize)
  })

  useEffect(() => {
    isChatInProgressRef.current = isRunning ?? false
    onChatInProgressChange.current?.(isRunning ?? false)
  }, [isRunning])

  useEffect(() => {
    copilotSendRef.current = onSubmitMessage ?? null
    return () => {
      copilotSendRef.current = null
    }
  }, [onSubmitMessage])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if (isRunning || !text) return
    dictation.stop()
    wasStoppedRef.current = false
    setValue('')
    base.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    disableActivePills()
    beforeSendRef.current?.()
    onSubmitMessage?.(text)
  }, [value, isRunning, onSubmitMessage, dictation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (!isRunning) handleSend()
      }
    },
    [isRunning, handleSend],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      resize()
    },
    [resize],
  )

  const canAct = isRunning || value.trim().length > 0
  const shownPlaceholder = placeholder ?? options.placeholder ?? chatPlaceholderRef.current ?? 'Ask Hana anything'

  return (
    <div className="hana-composer px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
      {/* Matches the thread column, so the composer's edges line up with the
          messages above it. */}
      <div className="mx-auto" style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}>
        {options.above}
        <div className="hana-composer-box">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={shownPlaceholder}
            aria-label="Message Hana"
            rows={1}
            className="min-w-0 flex-1 resize-none bg-transparent outline-none"
            style={{ fontFamily: 'inherit' }}
          />
          {showMic && dictation.supported && (
            <button
              type="button"
              className="hana-icon-btn"
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
              title={dictation.listening ? 'Stop dictation' : 'Dictate'}
              onClick={() => {
                if (dictation.listening) dictation.stop()
                else {
                  base.current = value.trim()
                  dictation.start()
                }
              }}
            >
              <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={isRunning ? () => { wasStoppedRef.current = true; onStop?.() } : handleSend}
            disabled={!canAct}
            aria-label={isRunning ? 'Stop' : 'Send'}
            title={isRunning ? 'Stop' : 'Send'}
            className="hana-icon-btn hana-icon-btn--primary"
          >
            {isRunning ? (
              <Square className="h-3 w-3" fill="currentColor" aria-hidden />
            ) : (
              <Send className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
        {dictation.blocked && (
          <p className="mt-1.5 text-center text-xs text-ui-muted" role="status">
            Microphone access is blocked. Allow it in your browser to dictate.
          </p>
        )}
      </div>
    </div>
  )
}
