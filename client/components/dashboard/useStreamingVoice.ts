'use client'

// ---------------------------------------------------------------------------
// useStreamingVoice — reusable realtime voice hook for CopilotKit v2 surfaces.
// ---------------------------------------------------------------------------
// Powers the embedded dashboard assistant's realtime voice mode. Covers:
//   - /ws/voice WebSocket + AudioWorklet PCM capture (streaming STT)
//   - live captions; utterance_final → submit(text) callback
//   - sentence-streaming TTS queue: speaks each completed sentence of the
//     assistant reply as it streams in (low latency), gaplessly via a queue
//   - half-duplex gating: mic audio is muted while a reply is playing so the
//     AI's own voice isn't transcribed (echo) and can't cut its reply off
//   - a persistent <audio> sink the consumer renders: <audio ref={audioRef} hidden />
//
// The consumer must obtain `agent` from useAgent({ ..., updates: [
// UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged ] }) so
// the component re-renders as the reply streams — this hook observes
// agent.messages/agent.isRunning on each render. `submit` should be a
// SERIALIZED addMessage+runAgent function (concurrent runAgent calls get
// rejected and drop replies).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureCopilotToken, getCopilotHeaders, getCopilotJwt } from './copilotConfig'

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const TTS_URL = `${AI_BACKEND_URL}/tts`
// Realtime streaming-STT WebSocket (http→ws, https→wss).
const VOICE_WS_URL = `${AI_BACKEND_URL.replace(/^http/, 'ws')}/ws/voice`
const TARGET_SAMPLE_RATE = 16000

// AudioWorklet processor source, loaded via a Blob URL (no separate file).
// Replaces the deprecated ScriptProcessorNode: accumulates mic samples off the
// main thread and posts ~4096-sample Float32 chunks back for downsampling/send.
const PCM_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._bufs = []
    this._len = 0
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) {
      this._bufs.push(new Float32Array(ch))
      this._len += ch.length
      if (this._len >= 4096) {
        const out = new Float32Array(this._len)
        let o = 0
        for (const b of this._bufs) { out.set(b, o); o += b.length }
        this._bufs = []
        this._len = 0
        this.port.postMessage(out, [out.buffer])
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor)
`

export function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : ((p as { text?: string })?.text ?? '')))
      .join('')
  }
  return ''
}

function ttsUrl(text: string): string {
  return `${TTS_URL}?text=${encodeURIComponent(text.slice(0, 4000))}`
}

// Maps card tool names to spoken announcements. The voice hook scans message
// history for the most recently called card tool so it can say e.g. "I've
// displayed the course cards for you" instead of a generic phrase.
const CARD_TOOL_PHRASES: Record<string, string> = {
  showAllCourses:         "I've displayed the course cards for you.",
  showEnrolledCourses:    "I've displayed your enrolled courses.",
  showInProgressCourses:  "I've displayed your in-progress courses.",
  showPendingCourses:     "I've displayed your pending courses.",
  showCompletedCourses:   "I've displayed your completed courses.",
  showCoursesByTopic:     "I've displayed the matching courses for you.",
  showHumanMentorCards:   "I've displayed the available mentors for you.",
  showAiMentorCards:      "I've displayed the AI mentors for you.",
  showOfferCards:         "I've displayed the available offers for you.",
  showSessionCards:       "I've displayed your sessions.",
  showEventCards:         "I've displayed the upcoming events for you.",
  showAiToolCards:        "I've displayed the AI business tools for you.",
  showResourcesForIntent: "I've displayed some matching resources for you.",
}

// Walks backwards through messages (stopping at the previous user turn) to
// find the most recently called card tool name, then returns its spoken phrase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveCardAnnouncement(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'user') break
    if (msg?.role === 'assistant' && Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        const name: string | undefined = tc?.function?.name
        if (name && Object.prototype.hasOwnProperty.call(CARD_TOOL_PHRASES, name)) {
          return CARD_TOOL_PHRASES[name]
        }
      }
    }
  }
  return "I've displayed the results for you."
}

// Strips chat-UI sentinels and numbered option lists from text before it is
// spoken, replacing them with short natural-language phrases so the voice
// output stays coherent even when the assistant response contains UI markers.
// Note: the suggest sentinel is intentionally NOT handled here — it's resolved
// to a card-specific phrase by deriveCardAnnouncement in the streaming effect.
function prepareForTts(text: string): string {
  // Options sentinel  →  keep prose above it, replace list with spoken label
  const optionsMatch = text.match(/<!--\s*options(?:-multi)?(?::\s*(.+?))?\s*-->/i)
  if (optionsMatch) {
    const sentinelIndex = text.indexOf(optionsMatch[0])
    const prose = text.slice(0, sentinelIndex).replace(/<!--[\s\S]*?-->/g, '').trim()
    const label = optionsMatch[1]?.trim()
    const spoken = label
      ? `I've displayed the options — ${label.toLowerCase()}.`
      : "I've displayed the options for you to choose from."
    return prose ? `${prose} ${spoken}` : spoken
  }

  // Strip any remaining HTML comments (safety net)
  return text.replace(/<!--[\s\S]*?-->/g, '').trim()
}

/**
 * Echo rejector: with the mic live during playback (needed for barge-in), the
 * mic can pick up the AI's own voice when browser echo-cancellation falls
 * short. If most of the transcribed words appear in what we just spoke, treat
 * it as echo — never as user speech.
 */
function looksLikeEcho(transcript: string, recentlySpoken: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9' ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const t = norm(transcript)
  const s = norm(recentlySpoken)
  if (!t) return true
  if (!s) return false
  // Real echo is the TTS audio leaking back — i.e. a VERBATIM fragment of what
  // we just spoke. Require a contiguous match, NOT shared words: a user
  // legitimately replying "hello" after the agent said "Hello! How can I help"
  // must never be classified as echo.
  if (s.includes(t)) return true
  // Long utterances: tolerate small ASR wording drift with near-total overlap.
  const words = t.split(' ')
  if (words.length >= 6) {
    const spoken = new Set(s.split(' '))
    return words.filter((w) => spoken.has(w)).length / words.length >= 0.9
  }
  return false
}

/** Real-speech gate for barge-in: ignore one-word blips ("uh", noise). */
function isSubstantialSpeech(transcript: string): boolean {
  const t = transcript.trim()
  return t.length >= 8 || t.split(/\s+/).filter(Boolean).length >= 2
}

/**
 * Semantic call state for call-style UIs (Ruby-style voice dock):
 * idle → connecting → listening ⇄ user-speaking ⇄ agent-speaking, or error.
 */
export type VoiceCallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'agent-speaking'
  | 'error'

export interface UseStreamingVoiceResult {
  voiceOn: boolean
  status: string
  caption: string
  lastText: string
  /** Semantic call state for call-style UIs. */
  voiceState: VoiceCallState
  /** Epoch ms when the call connected (Deepgram ready); null when idle. */
  callStartedAt: number | null
  /** Mic muted (user-initiated; independent of half-duplex auto-gating). */
  isMuted: boolean
  toggleMute(): void
  startVoice(): void
  stopVoice(): void
  replay(): void
  /** Stop TTS playback and clear the queue without interrupting the agent. */
  stopSpeaking(): void
  /** Attach to a persistent, hidden audio element: <audio ref={audioRef} hidden /> */
  audioRef: React.RefObject<HTMLAudioElement | null>
}

export function useStreamingVoice({
  agent,
  submit,
  onInterrupt,
}: {
  /** AG-UI AbstractAgent from useAgent (messages/isRunning are observed each render). */
  agent: unknown
  /** Called with each finalized utterance — must serialize addMessage + runAgent. */
  submit: (text: string) => void
  /**
   * Called when the user barges in while the agent is speaking — wire this to
   * `copilotkit.stopAgent({ agent })` so generation halts along with playback.
   */
  onInterrupt?: () => void
}): UseStreamingVoiceResult {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState('say something…')
  const [lastText, setLastText] = useState('')

  // Streaming-voice state/refs
  const [voiceOn, setVoiceOn] = useState(false)
  const [caption, setCaption] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceCallState>('idle')
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const mutedRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  // True while a reply is playing — we mute the mic→Deepgram feed during
  // playback (half-duplex) so the AI's own voice isn't transcribed (echo) and
  // can't cut its own reply off.
  const speakingRef = useRef(false)

  // Always-current callbacks (avoid stale closures inside ws.onmessage).
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  }, [submit])
  const onInterruptRef = useRef(onInterrupt)
  useEffect(() => {
    onInterruptRef.current = onInterrupt
  }, [onInterrupt])

  // --- Barge-in machinery ---
  // Abort handle for the clip currently playing (resolves its playClip promise).
  const clipAbortRef = useRef<(() => void) | null>(null)
  // Rolling buffer of recently spoken text + when we last spoke — used to
  // reject the AI's own voice echoing into the mic.
  const recentSpokenRef = useRef('')
  const lastSpokenAtRef = useRef(0)
  // Message id whose remaining sentences must NOT be spoken (user barged in).
  const suppressSpeakRef = useRef<string | null>(null)
  // Set by bargeIn() so pumpQueue's epilogue doesn't clobber the new state.
  const bargedRef = useRef(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG-UI AbstractAgent shape is loose
  const a = agent as any
  const isRunning: boolean = Boolean(a?.isRunning)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = a?.messages ?? []

  // --- Streaming TTS: speak each sentence as soon as it completes in the
  // agent's token stream (low latency), played gaplessly via a queue. ---
  const queueRef = useRef<string[]>([])
  const pumpingRef = useRef(false)
  const streamMsgIdRef = useRef<string | null>(null)
  const spokenLenRef = useRef(0)
  const voiceOnRef = useRef(false)
  useEffect(() => {
    voiceOnRef.current = voiceOn
  }, [voiceOn])

  // Synthesize one clip → audio blob (null on failure). Ensures the service
  // token is fresh first — without this, spoken replies silently die when the
  // 1-hour token expires mid-session.
  const fetchClipBlob = useCallback(async (text: string): Promise<Blob | null> => {
    const clip = text.trim()
    if (!clip) return null
    try {
      await ensureCopilotToken()
      const resp = await fetch(ttsUrl(clip), { headers: getCopilotHeaders() })
      if (!resp.ok) {
        console.warn('[voice] /tts failed', resp.status)
        return null
      }
      return await resp.blob()
    } catch (err) {
      console.warn('[voice] /tts fetch failed', err)
      return null
    }
  }, [])

  // Play one prepared blob; resolves when playback ends, fails, or is barged-in.
  const playBlob = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve) => {
      const el = audioRef.current
      if (!el) {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clipAbortRef.current = null
        resolve()
      }
      // Barge-in handle: stops this clip immediately and unblocks the queue.
      clipAbortRef.current = () => {
        try {
          el.pause()
        } catch {
          /* noop */
        }
        finish()
      }
      try {
        if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src)
        el.src = URL.createObjectURL(blob)
        el.onended = finish
        el.onerror = finish
        void el.play().catch((err) => {
          console.warn('[voice] playback failed', err)
          finish()
        })
      } catch (err) {
        console.warn('[voice] playback failed', err)
        finish()
      }
    })
  }, [])

  // Drain the sentence queue sequentially, PREFETCHING the next sentence's
  // audio while the current one plays so speech flows without per-sentence
  // synthesis gaps.
  const pumpQueue = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    speakingRef.current = true
    bargedRef.current = false
    setStatus('speaking…')
    if (voiceOnRef.current) setVoiceState('agent-speaking')

    let prefetched: { text: string; blob: Promise<Blob | null> } | null = null
    while (queueRef.current.length > 0) {
      const chunk = queueRef.current.shift() as string
      const blobPromise =
        prefetched && prefetched.text === chunk ? prefetched.blob : fetchClipBlob(chunk)
      prefetched = null

      // Kick off synthesis for the NEXT sentence while this one is handled.
      const next = queueRef.current[0]
      if (next !== undefined) prefetched = { text: next, blob: fetchClipBlob(next) }

      // Remember what we're saying so echo of our own voice can be rejected.
      recentSpokenRef.current = (recentSpokenRef.current + ' ' + chunk).slice(-700)
      lastSpokenAtRef.current = Date.now()
      const blob = await blobPromise
      if (bargedRef.current) break // user interrupted while synthesizing
      if (blob) await playBlob(blob)
      lastSpokenAtRef.current = Date.now()
    }

    pumpingRef.current = false
    speakingRef.current = false
    // If the user barged in, bargeIn() already set status/state — don't clobber.
    if (!bargedRef.current) {
      setStatus(voiceOnRef.current ? 'listening…' : 'ready')
      setVoiceState(voiceOnRef.current ? 'listening' : 'idle')
    }
  }, [fetchClipBlob, playBlob])

  // User talked over the agent: stop playback now, drop the unspoken rest of
  // this reply, and halt generation (via onInterrupt → stopAgent).
  const bargeIn = useCallback(() => {
    if (!speakingRef.current && queueRef.current.length === 0) return
    bargedRef.current = true
    queueRef.current = []
    if (streamMsgIdRef.current) suppressSpeakRef.current = streamMsgIdRef.current
    speakingRef.current = false
    clipAbortRef.current?.()
    try {
      onInterruptRef.current?.()
    } catch {
      /* noop */
    }
    setStatus('listening…')
    setVoiceState('user-speaking')
  }, [])

  // As the assistant reply streams in, enqueue each newly-completed sentence.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m?.role === 'assistant')
    if (!last) return
    const text = extractText(last.content)
    if (last.id !== streamMsgIdRef.current) {
      streamMsgIdRef.current = last.id
      spokenLenRef.current = 0
      // A new reply lifts any barge-in suppression from the previous one.
      if (suppressSpeakRef.current && suppressSpeakRef.current !== last.id) {
        suppressSpeakRef.current = null
      }
    }
    setLastText(text)

    // Speak ONLY while voice mode is on — typed text-mode replies stay silent.
    // Keep the spoken cursor in sync so enabling voice mid-reply doesn't
    // suddenly read out the backlog of the current message.
    if (!voiceOnRef.current) {
      spokenLenRef.current = text.length
      return
    }

    // User barged in on this reply — swallow the rest of it silently.
    if (suppressSpeakRef.current === last.id) {
      spokenLenRef.current = text.length
      return
    }

    // Pull complete sentences (terminator + whitespace) from the unspoken tail.
    // prepareForTts strips sentinels / option lists before sentence-splitting so
    // HTML comments and numbered option lists are never sent to /tts verbatim.
    const rawPending = text.slice(spokenLenRef.current)
    const pending = prepareForTts(rawPending)
    const sentenceRe = /[^.!?]*[.!?]+["')\]]*\s/g
    let consumed = 0
    let toSpeak = ''
    let m: RegExpExecArray | null
    while ((m = sentenceRe.exec(pending)) !== null) {
      toSpeak += m[0]
      consumed = sentenceRe.lastIndex
    }
    if (toSpeak.trim()) {
      // Advance the raw cursor by how much of the original text we consumed,
      // but only if the pending text wasn't transformed (sentinel case advances
      // the full raw slice so we don't re-process it on the next render).
      spokenLenRef.current += rawPending !== pending ? rawPending.length : consumed
      queueRef.current.push(toSpeak.trim())
      void pumpQueue()
    }

    // Run finished → flush the trailing fragment (no terminal punctuation).
    if (!isRunning) {
      const rawTail = text.slice(spokenLenRef.current).trim()
      if (!rawTail) return

      // Pure suggest sentinel: speak the card-specific announcement, then read
      // the suggestion pill text so the user knows what follow-up is available.
      if (/^<!--\s*suggest:/i.test(rawTail)) {
        spokenLenRef.current = text.length
        const announcement = deriveCardAnnouncement(messages)
        queueRef.current.push(announcement)
        queueRef.current.push("I've also prepared some follow-up suggestions for you below.")
        void pumpQueue()
        return
      }

      const tail = prepareForTts(rawTail)
      if (tail) {
        spokenLenRef.current = text.length
        queueRef.current.push(tail)
        void pumpQueue()
      } else if (rawTail) {
        // rawTail had content but prepareForTts reduced it to empty (e.g. a
        // pure sentinel with no prose). Advance the cursor so it isn't retried.
        spokenLenRef.current = text.length
      }
    }
  }, [messages, isRunning, pumpQueue])

  // Manual replay of the full last reply.
  const replay = useCallback(() => {
    if (!lastText.trim()) return
    queueRef.current = [lastText]
    void pumpQueue()
  }, [lastText, pumpQueue])

  // Stop TTS without interrupting the agent — used when the user clicks a pill
  // so queued sentences from the previous response don't keep playing.
  const stopSpeaking = useCallback(() => {
    queueRef.current = []
    clipAbortRef.current?.()
    speakingRef.current = false
    pumpingRef.current = false
    if (voiceOnRef.current) {
      setStatus('listening…')
      setVoiceState('listening')
    }
  }, [])

  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    mediaStreamRef.current = stream
    const ac = new AudioContext()
    audioCtxRef.current = ac
    // Load the inline AudioWorklet processor (replaces deprecated ScriptProcessorNode).
    const workletUrl = URL.createObjectURL(
      new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' }),
    )
    try {
      await ac.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }
    const source = ac.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ac, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0, // capture-only: nothing routed to the speakers
    })
    workletRef.current = node
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      // The mic stays LIVE during agent playback so the user can barge in —
      // browser echo-cancellation plus the transcript-level echo rejector
      // handle the AI's own voice. While muted, send silence instead of
      // nothing so Deepgram's idle timeout doesn't kill the STT stream.
      if (mutedRef.current) {
        ws.send(new Int16Array(1024).buffer)
        return
      }
      const input = e.data
      // Downsample to 16 kHz (Deepgram-side encoding is linear16/16k).
      let data: Float32Array = input
      if (ac.sampleRate !== TARGET_SAMPLE_RATE) {
        const ratio = ac.sampleRate / TARGET_SAMPLE_RATE
        const len = Math.round(input.length / ratio)
        const r = new Float32Array(len)
        for (let i = 0; i < len; i++) r[i] = input[Math.round(i * ratio)] ?? 0
        data = r
      }
      const pcm = new Int16Array(data.length)
      for (let i = 0; i < data.length; i++) {
        const s = Math.max(-1, Math.min(1, data[i] ?? 0))
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      ws.send(pcm.buffer)
    }
    source.connect(node)
  }, [])

  const stopVoice = useCallback(() => {
    // Hang-up also silences any reply still playing/queued.
    queueRef.current = []
    if (streamMsgIdRef.current) suppressSpeakRef.current = streamMsgIdRef.current
    speakingRef.current = false
    clipAbortRef.current?.()
    try {
      wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    } catch {
      /* noop */
    }
    try {
      wsRef.current?.close()
    } catch {
      /* noop */
    }
    wsRef.current = null
    if (workletRef.current) {
      workletRef.current.port.onmessage = null
      workletRef.current.disconnect()
      workletRef.current = null
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
    void audioCtxRef.current?.close()
    audioCtxRef.current = null
    setVoiceOn(false)
    setCaption('')
    setStatus('ready')
    setVoiceState('idle')
    setCallStartedAt(null)
    setIsMuted(false)
    mutedRef.current = false
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((v) => {
      mutedRef.current = !v
      return !v
    })
  }, [])

  const startVoice = useCallback(() => {
    if (voiceOn) return
    setVoiceOn(true)
    setStatus('connecting…')
    setVoiceState('connecting')
    // Fresh call — don't inherit echo-rejection state from a previous one.
    recentSpokenRef.current = ''
    lastSpokenAtRef.current = 0
    suppressSpeakRef.current = null
    void (async () => {
      // Voice is for logged-in users only; the WS upgrade is authenticated via
      // a token query param (browsers can't set WebSocket headers).
      const token = (await ensureCopilotToken()) ?? getCopilotJwt()
      if (!token) {
        setStatus('please log in to use voice')
        setVoiceState('error')
        setVoiceOn(false)
        return
      }
      const ws = new WebSocket(`${VOICE_WS_URL}?token=${encodeURIComponent(token)}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start' }))
    ws.onmessage = (ev) => {
      let m: { type?: string; text?: string; isFinal?: boolean; message?: string }
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
      } catch {
        return
      }
      if (m.type === 'ready') {
        setStatus('listening…')
        setVoiceState((s) => (s === 'agent-speaking' ? s : 'listening'))
        // `ready` also fires after a mid-call STT restart — keep the original
        // call clock and don't open a second mic pipeline.
        setCallStartedAt((t) => t ?? Date.now())
        if (!mediaStreamRef.current) {
          void startMic().catch((err) => {
            console.warn('[voice] mic error', err)
            // Keep the call dock visible in an error state — silently
            // collapsing back to the pill leaves users with no idea why the
            // call "didn't work". They end it with the hang-up button.
            try {
              wsRef.current?.close()
            } catch {
              /* noop */
            }
            wsRef.current = null
            setStatus('microphone blocked')
            setCaption('Microphone access was denied — allow it in your browser and try again')
            setVoiceState('error')
          })
        }
      } else if (m.type === 'transcript') {
        const text = m.text ?? ''
        if (speakingRef.current || pumpingRef.current) {
          // Agent is talking. Only a substantial, non-echo transcript counts
          // as the user talking over it → barge-in.
          if (isSubstantialSpeech(text) && !looksLikeEcho(text, recentSpokenRef.current)) {
            bargeIn()
            setCaption(text)
          }
          // else: our own voice echoing back — ignore entirely.
        } else {
          setCaption(text)
          setVoiceState((s) => (s === 'listening' ? 'user-speaking' : s))
        }
      } else if (m.type === 'utterance_final') {
        const text = m.text ?? ''
        setCaption('')
        setVoiceState((s) => (s === 'user-speaking' ? 'listening' : s))
        // Echo guard on finals too: if this utterance is mostly words we just
        // spoke (and we spoke recently), it's the AI hearing itself — never
        // submit that as a user message (it would answer itself in a loop).
        const speakingOrRecent =
          speakingRef.current || Date.now() - lastSpokenAtRef.current < 2500
        if (speakingOrRecent && looksLikeEcho(text, recentSpokenRef.current)) {
          console.debug('[voice] dropped echo utterance:', text.slice(0, 60))
          return
        }
        submitRef.current(text)
      } else if (m.type === 'stt_closed') {
        // Deepgram closed the STT stream mid-call (e.g. idle timeout) —
        // transparently restart it over the same WebSocket.
        if (voiceOnRef.current && ws.readyState === WebSocket.OPEN) {
          console.debug('[voice] STT closed — restarting')
          ws.send(JSON.stringify({ type: 'start' }))
        }
      } else if (m.type === 'error') {
        console.warn('[voice] server error', m.message)
        setStatus(`error: ${m.message ?? 'voice'}`)
        setVoiceState('error')
      }
    }
    ws.onerror = () => {
      setStatus('voice ws error')
      setVoiceState('error')
    }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
      }
    })()
  }, [voiceOn, startMic, stopVoice, bargeIn])

  // Clean up on unmount.
  useEffect(() => () => stopVoice(), [stopVoice])

  return {
    voiceOn,
    status,
    caption,
    lastText,
    voiceState,
    callStartedAt,
    isMuted,
    toggleMute,
    startVoice,
    stopVoice,
    stopSpeaking,
    replay,
    audioRef,
  }
}
