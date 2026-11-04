'use client'

/**
 * Voice helpers for Hana's chats (ported from SMEEP).
 *
 * Speaking: the browser's own speech recognition. It needs no upload and no
 * server; where it is missing the mic button is simply not shown.
 *
 * Listening: Hana's replies are spoken through the AI backend's /tts
 * endpoint (the same one the voice call uses), one reply at a time.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getCopilotHeaders } from './copilotConfig'

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

/** Text to speech for Hana's replies; one at a time. */
export function useReadAloud() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const requestRef = useRef(0)

  const stop = useCallback(() => {
    requestRef.current++
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setPlayingId(null)
    setLoadingId(null)
  }, [])

  const play = useCallback(
    async (id: string, text: string) => {
      stop()
      const request = ++requestRef.current
      const clean = text.replace(/[*_#>`[\]()]/g, '').trim()
      if (!clean) return
      setLoadingId(id)
      try {
        const resp = await fetch(`${AI_BACKEND_URL}/tts?text=${encodeURIComponent(clean.slice(0, 2500))}`, {
          headers: getCopilotHeaders(),
        })
        if (!resp.ok) throw new Error(`tts ${resp.status}`)
        const blob = await resp.blob()
        if (request !== requestRef.current) return
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          if (request === requestRef.current) stop()
        }
        setLoadingId(null)
        setPlayingId(id)
        await audio.play()
      } catch {
        if (request === requestRef.current) stop()
      }
    },
    [stop],
  )

  useEffect(() => stop, [stop])

  return { playingId, loadingId, play, stop }
}

export type ReadAloud = ReturnType<typeof useReadAloud>
