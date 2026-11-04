'use client'

/**
 * Video exam: Hana's face and voice from an Anam avatar (ported from SMEEP
 * 4744f93, itself from the VX examiner's AvatarCall). Anam runs in
 * "custom LLM" mode: it renders and speaks only; the exam is still the
 * examiner graph. The learner's speech, transcribed by Anam, goes through the
 * page's merge pipeline like voice-mode speech.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { apiFetch } from '@/lib/api'

/** Video calls are shorter than voice: the avatar plan is metered. */
export const MAX_VIDEO_CALL_MS = 6 * 60_000
/** After the scorecard lands, give Hana time to close, then hang up. */
const HANG_UP_AFTER_CARD_MS = 12_000
const AVATAR_VIDEO_ID = 'examiner-avatar-video'

/** The subset of the Anam client the page uses. */
export interface AnamClientLike {
  talk(text: string): Promise<void>
  stopStreaming(): Promise<void>
  muteInputAudio(): void
  unmuteInputAudio(): void
}

export function AnamCall({
  clientRef,
  onLive,
  onLearnerSpeech,
  onLearnerTalking,
  examOver,
  thinking,
  onExit,
}: {
  clientRef: MutableRefObject<AnamClientLike | null>
  onLive: (live: boolean) => void
  onLearnerSpeech: (text: string) => void
  /** Anam hears the learner talking: hold any pending reply. */
  onLearnerTalking: () => void
  /** The scorecard is shown: end the call once Hana has had time to close. */
  examOver: boolean
  /** Hana is preparing her reply: not the learner's turn yet. */
  thinking: boolean
  /** The call could not start: let the learner leave the exam screen. */
  onExit: () => void
}) {
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personaSpeaking, setPersonaSpeaking] = useState(false)
  const [caption, setCaption] = useState('')
  const heard = useRef(new Set<string>())
  const speechRef = useRef(onLearnerSpeech)
  const talkingRef = useRef(onLearnerTalking)
  useEffect(() => {
    speechRef.current = onLearnerSpeech
    talkingRef.current = onLearnerTalking
  })

  const stop = useCallback(() => {
    const client = clientRef.current
    clientRef.current = null
    onLive(false)
    if (client) void client.stopStreaming().catch(() => undefined)
  }, [clientRef, onLive])
  useEffect(() => stop, [stop])

  const live = state === 'live'
  const end = useCallback(() => {
    stop()
    setState('ended')
  }, [stop])

  useEffect(() => {
    if (!live) return
    const cap = window.setTimeout(end, MAX_VIDEO_CALL_MS)
    window.addEventListener('pagehide', end)
    return () => {
      window.clearTimeout(cap)
      window.removeEventListener('pagehide', end)
    }
  }, [live, end])
  useEffect(() => {
    if (!live || !examOver) return
    const t = window.setTimeout(end, HANG_UP_AFTER_CARD_MS)
    return () => window.clearTimeout(t)
  }, [live, examOver, end])

  const start = useCallback(async () => {
    setError(null)
    setState('connecting')
    try {
      const { data } = await apiFetch<{ data: { sessionToken: string } }>('/api/ai/anam/session-token', { method: 'POST' })
      const [{ createClient }, { AnamEvent }] = await Promise.all([
        import('@anam-ai/js-sdk'),
        import('@anam-ai/js-sdk/dist/module/types'),
      ])
      const client = createClient(data.sessionToken)
      clientRef.current = client as unknown as AnamClientLike
      client.addListener(AnamEvent.SESSION_READY, () => {
        setState('live')
        onLive(true)
      })
      client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        clientRef.current = null
        onLive(false)
        setState((s) => (s === 'live' ? 'ended' : 'idle'))
      })
      // Whose turn it is, and what Anam is hearing as the learner speaks.
      const captionParts = new Map<string, string>()
      client.addListener(
        AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED,
        (e: { id: string; role: string; content: string; endOfSpeech?: boolean; interrupted?: boolean }) => {
          if (e.role === 'persona') {
            setPersonaSpeaking(!e.endOfSpeech && !e.interrupted)
            return
          }
          if (e.content.trim()) talkingRef.current()
          captionParts.set(e.id, (captionParts.get(e.id) ?? '') + e.content)
          setCaption(e.endOfSpeech ? '' : (captionParts.get(e.id) ?? '').trim())
          if (e.endOfSpeech) captionParts.delete(e.id)
        },
      )
      // Each finished learner turn Anam transcribed is a reply.
      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (history: Array<{ id: string; role: string; content: string }>) => {
        for (const m of history) {
          if (m.role !== 'user' || heard.current.has(m.id)) continue
          heard.current.add(m.id)
          const text = m.content.trim()
          if (text) speechRef.current(text)
        }
      })
      await client.streamToVideoElement(AVATAR_VIDEO_ID)
    } catch (err) {
      console.warn('[examiner] video call failed', err)
      stop()
      const code = (err as { error?: { code?: string } } | null)?.error?.code
      setError(
        code === 'ANAM_NOT_CONFIGURED'
          ? 'Video exams are coming soon. Text and voice exams are ready for you now.'
          : code === 'RATE_LIMITED'
            ? 'Please wait a few minutes before starting another video exam.'
            : 'The video call couldn’t start. Please try again.',
      )
      setState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Starting the exam with Video chosen is the go-ahead: connect now. Deferred
  // a tick so StrictMode's throwaway first mount cancels it (one session, never two).
  useEffect(() => {
    const t = window.setTimeout(() => void start(), 0)
    return () => window.clearTimeout(t)
  }, [start])

  return (
    <div className="relative z-[2] flex-shrink-0 px-4 pt-3">
      <div
        className="relative mx-auto max-w-[776px] overflow-hidden rounded-[14px] border border-ui-line bg-black shadow-ui"
        style={{ aspectRatio: '16/6.5', minHeight: 150 }}
      >
        <video id={AVATAR_VIDEO_ID} autoPlay playsInline className="h-full w-full object-cover" />
        {state !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75" role="status">
            <p className="px-6 text-center text-sm font-medium text-white">
              {error ?? (state === 'ended' ? 'Call ended' : 'Connecting to Hana…')}
            </p>
            {error && (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex h-9 items-center rounded-[10px] bg-white px-4 text-sm font-semibold text-[#17171C] hover:bg-white/90"
              >
                Back to exam setup
              </button>
            )}
          </div>
        )}
        {live && (
          <>
            <div className="absolute bottom-2.5 left-3 right-24 rounded-md bg-black/45 px-2 py-1" aria-live="polite">
              <p className="text-[13px] font-semibold text-white">
                {personaSpeaking ? 'Hana is speaking…' : thinking && !examOver ? 'Hana is thinking…' : muted ? 'Mic muted' : 'Your turn, just speak'}
              </p>
              {caption && !personaSpeaking && <p className="truncate text-xs text-white" dir="auto">{caption}</p>}
            </div>
            <div className="absolute bottom-2.5 right-3 flex gap-1.5">
              <button
                type="button"
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
                onClick={() => {
                  const client = clientRef.current
                  if (!client) return
                  try {
                    if (muted) client.unmuteInputAudio()
                    else client.muteInputAudio()
                    setMuted(!muted)
                  } catch {
                    /* the call has already ended */
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-white hover:bg-white/35"
              >
                {muted ? <MicOff className="h-3.5 w-3.5" aria-hidden /> : <Mic className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <button
                type="button"
                aria-label="End call"
                onClick={end}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ui-danger text-white hover:opacity-90"
              >
                <PhoneOff className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
