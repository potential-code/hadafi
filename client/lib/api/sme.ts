import { apiFetch } from '@/lib/api'

export interface MentorUser {
  id: string
  fullName: string
  email: string
  bio: string | null
  meetingLink: string | null
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
