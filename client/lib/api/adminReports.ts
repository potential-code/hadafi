import { apiFetch } from '../api'
import type { AnalyticsRange } from './adminAnalytics'

/**
 * Admin reports: the impact dashboard, Analytics highlights (vs the previous
 * period), learning gain, spreadsheet exports and AI-drafted exam questions.
 * Server: server/routes/adminReports.ts.
 */

// ── Impact (admin home) ──────────────────────────────────────────────────────

export interface ImpactSummary {
  learners: number
  newLearners30d: number
  activeLearners30d: number
  countries: number
  enrolments: number
  lessonsCompleted: number
  coursesCompleted: number
  certificates: number
  mentorSessions: number
  finalExams: number
  finalExamAvgScore: number | null
  offersRedeemed: number
}

export interface ImpactMonth {
  /** "2026-10" */
  month: string
  activeLearners: number
  lessonsCompleted: number
  coursesCompleted: number
  certificates: number
}

export interface Impact {
  summary: ImpactSummary
  monthly: ImpactMonth[]
  uses: { label: string; learners: number }[]
  countries: { country: string; learners: number }[]
}

export const fetchImpact = () =>
  apiFetch<{ success: boolean; data: Impact }>('/api/admin/analytics/impact').then((r) => r.data)

// ── Analytics highlights ─────────────────────────────────────────────────────

export interface KpiDelta {
  current: number
  previous: number
}

export interface AnalyticsInsights {
  range: AnalyticsRange
  kpis: {
    newLearners: KpiDelta
    activeLearners: KpiDelta
    enrolments: KpiDelta
    lessonsCompleted: KpiDelta
    coursesCompleted: KpiDelta
    certificates: KpiDelta
    mentorSessions: KpiDelta
    finalExams: KpiDelta
    finalExamAvgScore: number | null
  }
  /** "YYYY-MM-DD" buckets for 7d/30d, "YYYY-MM" for 12m (UTC), oldest first. */
  series: {
    bucket: string
    newLearners: number
    activeLearners: number
    lessonsCompleted: number
    sessionsBooked: number
    sessionsCompleted: number
    sessionsCancelled: number
  }[]
  funnel: { step: string; learners: number }[]
  activityMix: { label: string; count: number }[]
  examScores: { band: string; attempts: number }[]
  examPassRate: number | null
  weekdays: { day: string; activeLearners: number }[]
  countries: { country: string; learners: number }[]
}

export const fetchAnalyticsInsights = (range: AnalyticsRange) =>
  apiFetch<{ success: boolean; data: AnalyticsInsights }>(`/api/admin/analytics/insights?range=${range}`).then((r) => r.data)

// ── Learning gain ────────────────────────────────────────────────────────────

export interface LearningGain {
  pairs: number
  avgPre: number | null
  avgPost: number | null
  avgGain: number | null
  improvedPct: number | null
  courses: { courseId: string; course: string; learners: number; avgPre: number; avgPost: number; avgGain: number }[]
}

export const fetchLearningGain = () =>
  apiFetch<{ success: boolean; data: LearningGain }>('/api/admin/analytics/learning-gain').then((r) => r.data)

// ── Exports ──────────────────────────────────────────────────────────────────

export type ExportDataset = 'learners' | 'course-progress' | 'learning-gain' | 'certificates' | 'redemptions' | 'mentor-sessions'

/** Downloads one export as a file; resolves with the number of rows in it. */
export async function downloadExport(dataset: ExportDataset, format: 'csv' | 'xlsx'): Promise<number> {
  const res = await fetch(`/api/admin/exports/${dataset}?format=${format}`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`export ${res.status}`)
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `hadafi-${dataset}.${format}`
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

// ── Write with AI (pre-tests and final exams) ────────────────────────────────

/** An AI-drafted question, not saved until the admin adds it. */
export type DraftQuestion = {
  format: 'multiple-choice' | 'true-false'
  question: string
  /** Multiple choice: 2 to 6 options. True/false: ["True", "False"]. */
  options: string[]
  /** Index into options (true/false: 0 = True). */
  correctIndex: number
  explanation: string
}
export type QuizDraftFormat = 'multiple-choice' | 'true-false' | 'mixed'

export const apiGenerateQuiz = (data: { assessmentId: string; count: number; format: QuizDraftFormat }) =>
  apiFetch<{ success: boolean; data: { questions: DraftQuestion[] } }>('/api/admin/quiz/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((r) => r.data)
