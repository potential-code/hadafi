/**
 * Badges and the leaderboard for the signed-in learner. Badges are awarded
 * on the server from real events; these calls only read them, plus the one
 * leaderboard visibility switch.
 */
import { apiFetch } from '@/lib/api'

export type Badge = {
  key: string
  title: string
  description: string
  earnedAt: string | null
  progress: { current: number; target: number }
}
export type Achievements = { balance: number; earned: number; showOnLeaderboard: boolean; badges: Badge[] }
export type LeaderboardPeriod = 'week' | 'month' | 'all'
export type LeaderboardEntry = {
  rank: number
  name: string
  initials: string
  avatarUrl: string | null
  points: number
  badges: number
  isYou: boolean
}
export type Leaderboard = {
  period: LeaderboardPeriod
  /** Closed until enough learners appear on it: no entries and no counts, so a small programme isn't exposed. */
  open: boolean
  minLearners: number
  entries: LeaderboardEntry[]
  /** Rank inside the top list; outside it a band ("top 10%"), never "of N learners". */
  you: { rank: number | null; topPercent: number | null; points: number } | null
  hidden: boolean
}
export type AchievementsSummary = { badges: number; total: number; next: string | null; rank: number | null; topPercent: number | null }

export function fetchAchievements() {
  return apiFetch<{ data: Achievements }>('/api/me/achievements').then((r) => r.data)
}

export function fetchAchievementsSummary() {
  return apiFetch<{ data: AchievementsSummary }>('/api/me/achievements/summary').then((r) => r.data)
}

export function fetchLeaderboard(period: LeaderboardPeriod) {
  return apiFetch<{ data: Leaderboard }>(`/api/me/leaderboard?period=${period}`).then((r) => r.data)
}

export function setLeaderboardVisibility(show: boolean) {
  return apiFetch<{ data: { show: boolean } }>('/api/me/leaderboard-visibility', {
    method: 'PUT',
    body: JSON.stringify({ show }),
  }).then((r) => r.data)
}
