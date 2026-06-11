'use client'

// ---------------------------------------------------------------------------
// Ruby-style voice call UI, ported from potentialcom-Replit's
// client/src/components/agent/voice/ (VoiceModeButton + VoiceHero):
//   - VoiceModeButton: compact "📞 Talk to …" pill shown in the chat header row
//   - VoiceDock: in-call dock that slides down under the header while a call is
//     active — breathing live dot, status + mm:ss timer, inline waveform while
//     the agent speaks, mute, and an always-present red end-call button.
// Driven by useStreamingVoice's VoiceCallState.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import type { VoiceCallState } from './useStreamingVoice'

function isVoiceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof WebSocket !== 'undefined'
  )
}

export function VoiceModeButton({
  onClick,
  agentName,
}: {
  onClick: () => void
  agentName: string
}) {
  if (!isVoiceSupported()) return null
  return (
    <button
      type="button"
      aria-label={`Talk to ${agentName}`}
      title={`Talk to ${agentName}`}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
    >
      <Phone className="h-3.5 w-3.5" />
      <span>Talk to {agentName}</span>
    </button>
  )
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function stateLabel(state: VoiceCallState, agentName: string): {
  primary: string
  secondary: string
} {
  switch (state) {
    case 'connecting':
      return { primary: 'Connecting', secondary: 'Setting up your call' }
    case 'listening':
      return { primary: 'Listening', secondary: 'Go ahead — say anything' }
    case 'user-speaking':
      return { primary: "I'm listening", secondary: 'Got you, keep going' }
    case 'agent-speaking':
      return { primary: 'Speaking', secondary: `${agentName} has something for you` }
    case 'error':
      return { primary: 'Call dropped', secondary: 'Hang up and try again' }
    default:
      return { primary: 'On call', secondary: '' }
  }
}

export function VoiceDock({
  state,
  callStartedAt,
  isMuted,
  caption,
  agentName,
  onMute,
  onHangup,
}: {
  state: VoiceCallState
  callStartedAt: number | null
  isMuted: boolean
  /** Live partial transcript — shown as the secondary line while the user talks. */
  caption: string
  agentName: string
  onMute: () => void
  onHangup: () => void
}) {
  // Tick the call timer once a second while connected.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!callStartedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [callStartedAt])

  const { primary, secondary } = stateLabel(state, agentName)
  const isSpeaking = state === 'agent-speaking'
  const showMute = !isSpeaking && state !== 'connecting'
  const showTimer = state !== 'connecting' && state !== 'error' && callStartedAt !== null
  const secondaryLine = caption ? `“${caption}”` : secondary

  return (
    <div
      data-state={state}
      className="flex items-center gap-3 border-b border-brand-surface-2 bg-muted/40 px-5 py-3 motion-safe:animate-voice-dock-down"
    >
      {/* Live-pulse indicator; inner ring speeds up while the agent speaks. */}
      <div className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className={
            'absolute inset-0 rounded-full bg-emerald-500/20 ' +
            (isSpeaking
              ? 'motion-safe:animate-voice-breathe-fast'
              : 'motion-safe:animate-voice-breathe')
          }
        />
        <span aria-hidden="true" className="relative h-2.5 w-2.5 rounded-full bg-emerald-600" />
        <span className="sr-only">{agentName} call</span>
      </div>

      {/* Status + timer + inline waveform */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">{primary}</span>
          {showTimer && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatDuration(now - (callStartedAt ?? now))}
            </span>
          )}
          {isSpeaking && (
            <span aria-hidden="true" className="ml-1 inline-flex h-3 items-end gap-0.5">
              {[0, 0.15, 0.3, 0.15, 0].map((delay, i) => (
                <span
                  key={i}
                  className="block h-full w-0.5 origin-bottom rounded-full bg-emerald-600 motion-safe:animate-sound-bar"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </span>
          )}
        </div>
        {secondaryLine && (
          <div className="hidden truncate text-xs text-muted-foreground sm:block">
            {secondaryLine}
          </div>
        )}
      </div>

      {/* Controls — mute (hidden while agent speaks), end-call always present. */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {showMute && (
          <button
            type="button"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title={isMuted ? 'Unmute' : 'Mute'}
            onClick={onMute}
            className={
              'inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ' +
              (isMuted
                ? 'border-foreground/30 bg-muted text-foreground'
                : 'border-brand-surface-2 bg-white hover:bg-muted')
            }
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          aria-label="End call"
          title="End call"
          onClick={onHangup}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
