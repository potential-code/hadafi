import { apiFetch } from '../api'
import type { ExportDataset, LearningGain } from './adminReports'

/**
 * Organisations and partner logins (server/routes/organisations.ts):
 * the admin area, the partner portal, the public sign-up link and the
 * learner's own organisation.
 */

export const ORGANISATION_TYPES = ['government', 'university', 'corporate', 'incubator', 'investor', 'other'] as const
export type OrganisationType = (typeof ORGANISATION_TYPES)[number]

export const ORGANISATION_TYPE_LABELS: Record<OrganisationType, string> = {
  government: 'Government',
  university: 'University',
  corporate: 'Corporate',
  incubator: 'Incubator or accelerator',
  investor: 'Investor',
  other: 'Other',
}
export const organisationTypeLabel = (t: string) => ORGANISATION_TYPE_LABELS[t as OrganisationType] ?? 'Other'

/** What a partner (and an admin, per organisation) can download. Mirrors the server's ORGANISATION_DATASETS. */
export const ORGANISATION_DATASETS: ExportDataset[] = ['learners', 'course-progress', 'learning-gain', 'certificates', 'mentor-sessions']

export interface OrganisationRow {
  id: string
  name: string
  type: string
  joinCode: string
  joinLink: string
  joinEnabled: boolean
  createdAt: string
  learners: number
  activeLearners: number
  partners: number
}

export interface OrganisationLearner {
  id: string
  fullName: string
  email: string
  company: string | null
  joinedAt: string
  lastActiveAt: string | null
  coursesStarted: number
  coursesCompleted: number
  certificates: number
  mentorSessions: number
  avgProgress: number | null
}

export interface OrganisationDashboardData {
  organisation: { id: string; name: string; type: string; joinCode: string; joinLink: string; joinEnabled: boolean }
  kpis: {
    learners: number
    activeLearners: number
    learning: number
    coursesCompleted: number
    certificates: number
    mentorSessions: number
    avgProgress: number | null
  }
  joinsByWeek: { week: string; joins: number }[]
  courses: { courseId: string; title: string; enrolled: number; completed: number; avgProgress: number }[]
  learners: OrganisationLearner[]
  learningGain: LearningGain
}

export interface PartnerContact {
  id: string
  fullName: string
  email: string
  status: 'active' | 'invited'
  at: string | null
}

export interface AddLearnersResult {
  added: string[]
  moved: string[]
  already: string[]
  notFound: string[]
  notLearners: string[]
}

export interface ParticipantRecordData {
  profile: {
    id: string
    fullName: string
    email: string
    company: string | null
    country: string | null
    points: number
    createdAt: string
    lastActiveAt: string | null
    avatarUrl: string | null
  }
  streak: { current: number; longest: number; week: { date: string; done: boolean }[]; activeDaysLast60: number }
  activity: { at: string; kind: string; text: string }[]
  courses: {
    courseId: string
    title: string
    enrolledAt: string | null
    progress: number
    completedAt: string | null
    units: { module: string; title: string; status: string; completedAt: string | null }[]
    exams: {
      type: 'pre' | 'post'
      title: string
      attempt: number
      score: number | null
      passed: boolean | null
      completedAt: string | null
      answers: { question: string; options: string[]; chosen: number | null; correct: number; isCorrect: boolean }[]
    }[]
    responses: { kind: string; unit: string; prompt: string; answer: string; submittedAt: string | null }[]
  }[]
  certificates: { number: string; course: string; issuedAt: string; status: string }[]
  mentorSessions: { mentorName: string; startsAt: string; minutes: number; status: string; cancelledBy: string | null; bookedAt: string }[]
}

type Ok<T> = { success: boolean; data: T }
const get = <T>(path: string) => apiFetch<Ok<T>>(path).then((r) => r.data)
const send = <T>(method: string, path: string, body?: unknown) =>
  apiFetch<Ok<T>>(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).then((r) => r.data)

// ── Admin ────────────────────────────────────────────────────────────────────

const A = '/api/admin/organisations'
export const fetchOrganisations = () => get<OrganisationRow[]>(A)
export const createOrganisation = (body: { name: string; type: OrganisationType }) => send<{ id: string }>('POST', A, body)
export const updateOrganisation = (id: string, body: Partial<{ name: string; type: OrganisationType; joinEnabled: boolean }>) =>
  send('PATCH', `${A}/${id}`, body)
export const regenerateJoinCode = (id: string) => send('POST', `${A}/${id}/join-code`)
export const archiveOrganisation = (id: string) => send('DELETE', `${A}/${id}`)
export const fetchOrganisationDashboard = (id: string) => get<OrganisationDashboardData>(`${A}/${id}/dashboard`)
export const addOrganisationLearners = (id: string, emails: string[]) => send<AddLearnersResult>('POST', `${A}/${id}/learners`, { emails })
export const removeOrganisationLearner = (id: string, userId: string) => send('DELETE', `${A}/${id}/learners/${userId}`)
export const fetchOrganisationPartners = (id: string) => get<PartnerContact[]>(`${A}/${id}/partners`)
export const invitePartner = (id: string, body: { fullName: string; email: string }) => send<PartnerContact>('POST', `${A}/${id}/partners`, body)
export const removePartner = (id: string, userId: string) => send('DELETE', `${A}/${id}/partners/${userId}`)

// ── Partner ──────────────────────────────────────────────────────────────────

export const fetchPartnerDashboard = () => get<OrganisationDashboardData>('/api/partner/dashboard')

// ── Downloads ────────────────────────────────────────────────────────────────

/** Downloads one organisation export from `base` (…/exports); resolves with the number of rows. */
export async function downloadFrom(base: string, dataset: ExportDataset, format: 'csv' | 'xlsx'): Promise<number> {
  const res = await fetch(`${base}/${dataset}?format=${format}`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`export ${res.status}`)
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `${dataset}.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return Number(res.headers.get('x-row-count') ?? 0)
}

// ── Public and the learner's own ─────────────────────────────────────────────

export const fetchJoinInfo = (code: string) => get<{ name: string; code: string }>(`/api/organisations/join/${encodeURIComponent(code)}`)
export const fetchMyOrganisation = () => get<{ id: string; name: string } | null>('/api/me/organisation')
export const leaveMyOrganisation = () => send('POST', '/api/me/organisation/leave')
