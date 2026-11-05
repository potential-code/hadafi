import { apiFetch } from '@/lib/api'

import { API_BASE } from '@/lib/api'

export interface MentorUser {
  id: string
  fullName: string
  bio: string | null
  timezone: string | null
  avatarUrl: string | null
  linkedinUrl: string | null
  expertise: string[] | null
}

export interface Slot {
  id: string
  startsAt: string
  endsAt: string
  isAvailable: boolean
}

export interface SmeSession {
  id: string
  status: 'confirmed' | 'cancelled' | 'completed'
  meetingLink: string | null
  slot: { startsAt: string; endsAt: string }
  mentorUser: { fullName: string; email: string; avatarUrl: string | null }
}

export const getMentors = () => apiFetch<MentorUser[]>('/api/mentors')

export const getMentorAvailability = (mentorId: string) =>
  apiFetch<Record<string, Slot[]>>(`/api/mentors/${mentorId}/availability`)

export const bookSession = (slotId: string) =>
  apiFetch<{ session: SmeSession; slot: Slot; mentorName: string; smeName: string }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ slotId }),
  })

export const getSmeSessions = () =>
  apiFetch<{ upcoming: SmeSession[]; past: SmeSession[] }>('/api/sessions')

export const cancelSmeSession = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/sessions/${id}/cancel`, { method: 'PATCH' })

// ── AI mentors ──────────────────────────────────────────────────────────────
// The bot service is reached through Hadafi's server (/api/ai-mentors), behind
// the learner's session, never from the browser directly.

export interface AiMentorConfig {
  name: string
  greeting: string
  active: boolean
  /** The bot's own ice-breakers. */
  prePrompt: string[]
}

export const getAiMentorConfig = (botId: string) =>
  apiFetch<{ success: boolean; data: AiMentorConfig }>(`/api/ai-mentors/${encodeURIComponent(botId)}`).then((r) => r.data)

export interface AiMentorChatBody {
  message: string
  sessionId: string
  /** A text document the learner shared with this message. */
  document?: { name: string; text: string; truncated?: boolean }
}

/**
 * Sends a message to an AI mentor and returns the raw response, whose body is
 * the mentor's server-sent event stream. Not through `apiFetch`, which reads
 * the whole body as JSON.
 */
export function streamAiMentorChat(botId: string, body: AiMentorChatBody, signal?: AbortSignal): Promise<Response> {
  return fetch(`${API_BASE}/api/ai-mentors/${encodeURIComponent(botId)}/chat`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

/** The server's message from a body `apiFetch` threw ({ success: false, error: { message } }), else `fallback`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: unknown } | string; message?: unknown } | null
  const msg = e && typeof e.error === 'object' ? e.error?.message : e?.message
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}
