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
 * can't pass props). All are optional, so every existing chat keeps working
 * unchanged: `attach` adds a paperclip for sharing a document with Hana,
 * `closed` replaces the input with a note once a conversation is over.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CopilotChatInputProps } from '@copilotkit/react-core/v2'
import { FileText, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
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
import { DOCUMENT_HINT, type HanaAttachOptions, type HanaSharedDocument } from './hanaDocuments'
import { cn } from '@/lib/utils'

export interface HanaComposerOptionsValue {
  placeholder?: string
  /** Show the dictation mic where the browser supports it (default true). */
  dictation?: boolean
  /** Content shown just above the input box (e.g. shortcut menus). */
  above?: ReactNode
  /** Let the learner share a document (a paperclip); off unless provided. */
  attach?: HanaAttachOptions
  /** The conversation is over (e.g. a marked exam): this note replaces the input. */
  closed?: string
}

type Attachment =
  | { status: 'reading'; name: string }
  | { status: 'ready'; name: string; doc: HanaSharedDocument }
  | { status: 'error'; name: string; error: string }

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

  // A shared document: read on the server once chosen, sent with the next message.
  const attach = options.attach
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readSeq = useRef(0)
  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !attach) return
      const seq = ++readSeq.current
      setAttachment({ status: 'reading', name: file.name })
      try {
        const doc = await attach.read(file)
        if (seq === readSeq.current) setAttachment({ status: 'ready', name: doc.name, doc })
      } catch (e) {
        if (seq === readSeq.current)
          setAttachment({ status: 'error', name: file.name, error: e instanceof Error ? e.message : 'That file could not be read.' })
      }
      textareaRef.current?.focus({ preventScroll: true })
    },
    [attach],
  )
  const removeAttachment = useCallback(() => {
    readSeq.current++
    setAttachment(null)
  }, [])

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
    const typed = value.trim()
    if (isRunning || attachment?.status === 'reading') return
    const doc = attachment?.status === 'ready' && attach ? attachment.doc : null
    if (!typed && !doc) return
    const text = doc && attach ? attach.compose(typed || attach.defaultMessage, doc) : typed
    if (doc) setAttachment(null)
    dictation.stop()
    wasStoppedRef.current = false
    setValue('')
    base.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    disableActivePills()
    beforeSendRef.current?.()
    onSubmitMessage?.(text)
  }, [value, isRunning, onSubmitMessage, dictation, attachment, attach])

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

  const docReady = attachment?.status === 'ready'
  const canAct = isRunning || ((value.trim().length > 0 || docReady) && attachment?.status !== 'reading')
  const basePlaceholder = placeholder ?? options.placeholder ?? chatPlaceholderRef.current ?? 'Ask Hana anything'
  const shownPlaceholder = docReady && attach ? attach.askAbout(attachment.name) : basePlaceholder

  if (options.closed) {
    return (
      <div className="hana-composer px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
        <p
          className="mx-auto rounded-[12px] border border-ui-line bg-ui-surface-2 px-4 py-3 text-center text-[13px] text-ui-muted"
          style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}
        >
          {options.closed}
        </p>
      </div>
    )
  }

  return (
    <div className="hana-composer px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
      {/* Matches the thread column, so the composer's edges line up with the
          messages above it. */}
      <div className="mx-auto" style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}>
        {options.above}
        {attachment && (
          <div
            className={cn('hana-attachment', attachment.status === 'error' && 'hana-attachment--error')}
            role="status"
            aria-live="polite"
          >
            <span className="hana-attachment-icon" aria-hidden>
              {attachment.status === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" strokeWidth={1.75} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ui-text">{attachment.name}</span>
              <span className={cn('block text-xs', attachment.status === 'error' ? 'text-ui-text' : 'truncate text-ui-muted')}>
                {attachment.status === 'reading'
                  ? 'Reading…'
                  : attachment.status === 'error'
                    ? attachment.error
                    : [
                        'Ready',
                        attachment.doc.pages ? `${attachment.doc.pages} page${attachment.doc.pages === 1 ? '' : 's'}` : null,
                        attachment.doc.truncated ? 'Hana reads the first part' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
              </span>
            </span>
            <button type="button" className="hana-attachment-remove" onClick={removeAttachment} aria-label={`Remove ${attachment.name}`}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        <div
          className="hana-composer-box"
          onDragOver={attach ? (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() } : undefined}
          onDrop={
            attach
              ? (e) => {
                  if (!e.dataTransfer.files.length) return
                  e.preventDefault()
                  void pickFile(e.dataTransfer.files[0])
                }
              : undefined
          }
        >
          {attach && (
            <>
              <button
                type="button"
                className="hana-icon-btn hana-icon-btn--ghost"
                onClick={() => fileRef.current?.click()}
                aria-label="Share a document with Hana"
                title={`Share a document (${DOCUMENT_HINT})`}
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={attach.accept}
                hidden
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  void pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          )}
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
