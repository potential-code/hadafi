/**
 * Client calls for the features added in the redesign (ported from SMEEP):
 * learning streak, course topics, mentor notes, mentor photo, sessions that
 * need completion, and the admin "Needs attention" panel.
 *
 * Every response is `{ data: ... }`, like the rest of the API.
 */
import { apiFetch } from '@/lib/api'

// ── Learner: streak and daily goal ────────────────────────────────────────────

export type StreakDay = { date: string; done: boolean }
export type Streak = {
  /** Consecutive days, ending today or yesterday, with at least one completed step. */
  currentStreak: number
  longestStreak: number
  /** Unit steps (blocks) completed today. */
  todaySteps: number
  /** Steps needed to meet today's goal. Fixed at 1 for now. */
  dailyGoal: number
  /** Monday to Sunday of the current week in the learner's timezone. */
  week: StreakDay[]
}

export function fetchStreak() {
  return apiFetch<{ data: Streak }>('/api/me/streak').then((r) => r.data)
}

// ── Course topics ─────────────────────────────────────────────────────────────

/** Fixed topic list used for course filters. `null` on a course = uncategorised. */
export const COURSE_TOPICS = [
  'Money and finance',
  'Sales and customers',
  'People and leadership',
  'Digital and AI',
  'Starting a business',
  'Personal effectiveness',
] as const
export type CourseTopic = (typeof COURSE_TOPICS)[number]
// Courses from the existing course APIs now carry `category: CourseTopic | null`
// (learner /api/lms/courses, /api/lms/courses/:id, admin /api/lms/admin/courses[/:id]).
// Admin create/PATCH accept `category` (a topic or null). Filtering is client-side.

// ── Mentor: session notes, mentee notes, photo ───────────────────────────────

export function saveSessionNotes(sessionId: string, notes: string) {
  return apiFetch<{ data: { id: string; mentorNotes: string } }>(`/api/mentor/sessions/${sessionId}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  }).then((r) => r.data)
}

/**
 * Mentee notes are per mentor. A mentor can only read/write notes for an SME
 * who has booked at least one session with them (otherwise 404). Notes max
 * 20,000 characters (session notes too).
 */
export type MenteeNotes = { menteeId: string; notes: string; updatedAt: string | null }

export function fetchMenteeNotes(menteeId: string) {
  return apiFetch<{ data: MenteeNotes }>(`/api/mentor/mentees/${menteeId}/notes`).then((r) => r.data)
}

export function saveMenteeNotes(menteeId: string, notes: string) {
  return apiFetch<{ data: MenteeNotes }>(`/api/mentor/mentees/${menteeId}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ notes }),
  }).then((r) => r.data)
}

/**
 * Uploads a JPEG/PNG/WebP (max 5 MB) and returns the new public avatar URL
 * (absolute, served by the API). Errors: 413 FILE_TOO_LARGE, 415
 * UNSUPPORTED_IMAGE, 400 INVALID_UPLOAD (no `photo` field).
 */
export async function uploadMentorPhoto(file: File): Promise<{ avatarUrl: string }> {
  const form = new FormData()
  form.append('photo', file)
  const res = await fetch('/api/mentor/profile/photo', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw body
  return (body as { data: { avatarUrl: string } }).data
}

// Mentor sessions (GET /api/mentor/sessions, unchanged envelope `{ upcoming, past }`)
// now carry the fields below on every session:
//  - `smeUser.id` (the mentee id for the mentee-notes calls), `smeUser.company`, `smeUser.country`
//  - `mentorNotes` (string | null)
//  - `needsCompletion`: true for a session still "confirmed" after its end time.
//    Such sessions are in `past`; mark them with the existing
//    PATCH /api/mentor/sessions/:id/complete or /cancel.
// Buckets: `upcoming` = confirmed and not yet ended (includes a session in
// progress right now); `past` = ended, completed or cancelled.
// GET /api/mentor/analytics also returns `sessionsNeedingCompletion: number`.
export type MentorSessionExtras = {
  smeUser: { id: string; company: string | null; country: string | null }
  mentorNotes: string | null
  needsCompletion: boolean
}

// ── Admin: needs attention ────────────────────────────────────────────────────

export type NeedsAttention = {
  pendingMentorApplications: number
  /** Stakeholder applications have no review status; this counts those received in the last 30 days. */
  pendingStakeholderApplications: number
  draftCourses: number
  /** Active codes never redeemed, oldest first (max 50). */
  unusedInviteCodes: { code: string; createdAt: string }[]
  mentorSessionsNeedingCompletion: number
}

export function fetchNeedsAttention() {
  return apiFetch<{ data: NeedsAttention }>('/api/admin/needs-attention').then((r) => r.data)
}
