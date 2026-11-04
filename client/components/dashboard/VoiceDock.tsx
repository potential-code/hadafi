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
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
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
  className,
}: {
  onClick: () => void
  agentName: string
  className?: string
}) {
  // Decided after mount: the server render has no navigator, and rendering
  // the button only on the client avoids a hydration mismatch.
  const [supported, setSupported] = useState(false)
  useEffect(() => setSupported(isVoiceSupported()), [])
  if (!supported) return null
  return (
    <button
      type="button"
      title={`Talk to ${agentName}`}
      onClick={onClick}
      className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 px-3.5', className)}
    >
      <Phone className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
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
      return { primary: 'Listening', secondary: 'Go ahead, say anything' }
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
      role="status"
      aria-live="polite"
      className="relative z-[2] flex items-center gap-3 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 motion-safe:animate-voice-dock-down"
    >
      {/* Live-pulse indicator; inner ring speeds up while the agent speaks. */}
      <div className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className={
            'absolute inset-0 rounded-full bg-ui-ok-soft ' +
            (isSpeaking
              ? 'motion-safe:animate-voice-breathe-fast'
              : 'motion-safe:animate-voice-breathe')
          }
        />
        <span aria-hidden="true" className="relative h-2.5 w-2.5 rounded-full bg-ui-ok" />
        <span className="sr-only">{agentName} call</span>
      </div>

      {/* Status + timer + inline waveform */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ui-text">{primary}</span>
          {showTimer && (
            <span className="text-xs tabular-nums text-ui-muted">
              {formatDuration(now - (callStartedAt ?? now))}
            </span>
          )}
          {isSpeaking && (
            <span aria-hidden="true" className="ml-1 inline-flex h-3 items-end gap-0.5">
              {[0, 0.15, 0.3, 0.15, 0].map((delay, i) => (
                <span
                  key={i}
                  className="block h-full w-0.5 origin-bottom rounded-full bg-ui-ok motion-safe:animate-sound-bar"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </span>
          )}
        </div>
        {secondaryLine && (
          <div className="hidden truncate text-[13px] text-ui-muted sm:block">
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
            aria-pressed={isMuted}
            className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-9 w-9', isMuted && 'bg-ui-surface-2')}
          >
            {isMuted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          aria-label="End call"
          title="End call"
          onClick={onHangup}
          className={cn(btn({ variant: 'danger', size: 'icon' }), 'h-9 w-9')}
        >
          <PhoneOff className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
