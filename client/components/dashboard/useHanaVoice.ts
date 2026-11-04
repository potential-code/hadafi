'use client'

/**
 * Voice helpers for Hana's chats (ported from SMEEP).
 *
 * Speaking: the browser's own speech recognition. It needs no upload and no
 * server; where it is missing the mic button is simply not shown.
 *
 * Listening: Hana's replies are spoken through the AI backend's /tts
 * endpoint (the same one the voice call uses), one reply at a time.
 * A visitor without an account hears the browser's own voice instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getUser } from '@/lib/auth'
import { ensureCopilotToken, getCopilotHeaders } from './copilotConfig'

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'

type RecognitionCtor = new () => {
  lang: string
  interimResults: boolean
  continuous: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((event: any) => void) | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as RecognitionCtor | null
}

/** Speech to text into a text field. `locale` is a BCP 47 tag (default en-US). */
export function useDictation(onText: (text: string, final: boolean) => void, locale = 'en-US') {
  // Decided after mount: the server render has no window, and reading it in
  // render would make the first client render differ from the server's.
  const [Ctor, setCtor] = useState<RecognitionCtor | null>(null)
  useEffect(() => setCtor(() => recognitionCtor()), [])
  const [listening, setListening] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const recRef = useRef<InstanceType<RecognitionCtor> | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    recRef.current?.abort()
    const rec = new Ctor()
    rec.lang = locale
    rec.interimResults = true
    rec.continuous = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let text = ''
      let final = false
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
        if (event.results[i].isFinal) final = true
      }
      onTextRef.current(text, final)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') setBlocked(true)
      setListening(false)
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
  }, [Ctor, locale])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: Boolean(Ctor), listening, blocked, start, stop }
}

// ── Read aloud ───────────────────────────────────────────────────────────────
//
// One reply plays at a time across the whole page (every Hana chat shares this
// store), spoken by the AI backend's /tts with the signed-in user's token, the
// same voice as Hana's voice call. Visitors without an account (the sign-up
// chat) have a guest token, which /tts doesn't accept, so their browser's own
// speech voice reads instead; so does any reply /tts can't serve.

type ReadAloudState = { playingId: string | null; loadingId: string | null }

let readState: ReadAloudState = { playingId: null, loadingId: null }
const readListeners = new Set<() => void>()
let readRequest = 0
let readOwner: symbol | null = null
let readAudio: HTMLAudioElement | null = null
let readUrl: string | null = null

function setReadState(next: ReadAloudState) {
  readState = next
  readListeners.forEach((l) => l())
}

function stopReading() {
  readRequest++
  readOwner = null
  readAudio?.pause()
  readAudio = null
  if (readUrl) URL.revokeObjectURL(readUrl)
  readUrl = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  if (readState.playingId || readState.loadingId) setReadState({ playingId: null, loadingId: null })
}

function speakInBrowser(id: string, text: string, request: number): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const utterance = new SpeechSynthesisUtterance(text)
  const done = () => {
    if (request === readRequest) stopReading()
  }
  utterance.onend = done
  utterance.onerror = done
  window.speechSynthesis.cancel()
  setReadState({ playingId: id, loadingId: null })
  window.speechSynthesis.speak(utterance)
  return true
}

async function startReading(id: string, text: string, owner: symbol) {
  stopReading()
  const request = ++readRequest
  readOwner = owner
  const clean = text.replace(/[*_#>`[\]()]/g, '').trim().slice(0, 2500)
  if (!clean) return
  setReadState({ playingId: null, loadingId: id })
  try {
    if (!getUser()) throw new Error('guest')
    await ensureCopilotToken()
    if (request !== readRequest) return
    const resp = await fetch(`${AI_BACKEND_URL}/tts?text=${encodeURIComponent(clean)}`, {
      headers: getCopilotHeaders(),
    })
    if (!resp.ok) throw new Error(`tts ${resp.status}`)
    const blob = await resp.blob()
    if (request !== readRequest) return
    const url = URL.createObjectURL(blob)
    readUrl = url
    const audio = new Audio(url)
    readAudio = audio
    audio.onended = () => {
      if (request === readRequest) stopReading()
    }
    setReadState({ playingId: id, loadingId: null })
    await audio.play()
  } catch {
    if (request !== readRequest) return
    if (readAudio) {
      // The audio loaded but the browser wouldn't play it (autoplay rules).
      stopReading()
      return
    }
    if (!speakInBrowser(id, clean, request)) stopReading()
  }
}

function subscribeReadAloud(listener: () => void) {
  readListeners.add(listener)
  return () => {
    readListeners.delete(listener)
  }
}
const SERVER_READ_STATE: ReadAloudState = { playingId: null, loadingId: null }

/**
 * Text to speech for Hana's replies; one at a time on the page. A reply this
 * hook started stops when the component using it unmounts (leaving the chat).
 */
export function useReadAloud() {
  const state = useSyncExternalStore(subscribeReadAloud, () => readState, () => SERVER_READ_STATE)
  const ownerRef = useRef<symbol>(Symbol('read-aloud'))
  const stop = useCallback(() => stopReading(), [])
  const play = useCallback((id: string, text: string) => startReading(id, text, ownerRef.current), [])
  useEffect(() => {
    const owner = ownerRef.current
    return () => {
      if (readOwner === owner) stopReading()
    }
  }, [])
  return useMemo(
    () => ({ playingId: state.playingId, loadingId: state.loadingId, play, stop }),
    [state.playingId, state.loadingId, play, stop],
  )
}

export type ReadAloud = ReturnType<typeof useReadAloud>
