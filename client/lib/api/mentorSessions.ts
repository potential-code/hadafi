import { apiFetch } from '@/lib/api'

export interface SessionWithDetails {
  id: string
  status: string
  meetingLink: string | null
  slot: { startsAt: string; endsAt: string }
  smeUser: {
    /** Present once the server returns mentee ids (needed for mentee notes). */
    id?: string
    fullName: string
    email: string
    avatarUrl: string | null
    company?: string | null
    country?: string | null
  }
  /** 'mentor' or 'sme' when the session was cancelled. */
  cancelledBy?: string | null
  cancelledAt?: string | null
  bookedAt?: string
  /** Past confirmed session whose end time has passed without being marked. */
  needsCompletion?: boolean
  /** The mentor's private notes for this session. */
  mentorNotes?: string | null
}

export interface SessionsData {
  upcoming: SessionWithDetails[]
  past: SessionWithDetails[]
}

export const getMentorSessionsList = () =>
  apiFetch<SessionsData>('/api/mentor/sessions')

export const cancelMentorSessionApi = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/mentor/sessions/${id}/cancel`, { method: 'PATCH' })

export const completeMentorSessionApi = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/mentor/sessions/${id}/complete`, { method: 'PATCH' })

export const getMentorAnalytics = () =>
  apiFetch<{ upcomingSessions: number; totalMentees: number; completedSessions: number; sessionsNeedingCompletion?: number }>(
    '/api/mentor/analytics',
  )
