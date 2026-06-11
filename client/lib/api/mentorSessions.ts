import { apiFetch } from '@/lib/api'

export interface SessionWithDetails {
  id: string
  status: string
  meetingLink: string | null
  slot: { startsAt: string; endsAt: string }
  smeUser: { fullName: string; email: string; avatarUrl: string | null }
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
  apiFetch<{ upcomingSessions: number; totalMentees: number; completedSessions: number }>(
    '/api/mentor/analytics',
  )
