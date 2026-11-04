/**
 * Client for /api/multi-learning: the learner side of Hana as the tutor.
 * Types mirror server/services/multiLearning.service.ts.
 */

import { apiFetch } from '@/lib/api'

export type UnitStep =
  | { kind: 'intro'; unitId: string; blockIds: string[]; done: boolean }
  | { kind: 'video'; unitId: string; blockId: string; title: string; done: boolean }
  | { kind: 'reading'; unitId: string; blockIds: string[]; done: boolean }
  | { kind: 'action-plan'; unitId: string; blockId: string; done: boolean }
  | { kind: 'check-in'; unitId: string; blockId: string; done: boolean }

export interface StateUnit {
  unitId: string
  name: string
  moduleName: string
  order: number
  complete: boolean
  steps: UnitStep[]
}

export interface FinalQuiz {
  assessmentId: string
  title: string
  isGraded: boolean
  passingScore: number
  maxAttempts: number
  attemptsUsed: number
  bestScore: number | null
  passed: boolean
  locked: boolean
  done: boolean
}

export interface PreTest {
  assessmentId: string
  title: string
  isGraded: boolean
  passingScore: number
  attemptsUsed: number
  done: boolean
}

export interface CourseSummary {
  courseId: string
  name: string
  progress: number
  complete: boolean
}

export type NextStep =
  | { action: 'show_courses'; reason: 'no_active_course' | 'course_complete' | 'quiz_not_passed' }
  | { action: 'show_unit_intro'; unitId: string }
  | { action: 'show_video'; unitId: string; learningBlockId: string }
  | { action: 'show_summary'; unitId: string }
  | { action: 'show_action_plan'; unitId: string; learningBlockId: string; checkIn?: boolean }
  | { action: 'show_quiz'; assessmentId: string; retake: boolean; pretest?: boolean }

export interface CourseState {
  language: 'en'
  courses: CourseSummary[]
  active: null | {
    courseId: string
    name: string
    progress: number
    units: StateUnit[]
    preTest: PreTest | null
    finalQuiz: FinalQuiz | null
    currentUnitId: string | null
    complete: boolean
  }
  next: NextStep
  text: string
}

export interface UnitIntro {
  unitId: string
  title: string
  description: string
  introduction: string
  outcomes: string[]
}

export interface VideoLesson {
  learningBlockId: string
  unitId: string
  title: string
  videoUrl: string
  transcript: string
}

export interface QuestionStep {
  learningBlockId: string
  unitId: string
  kind: 'action-plan' | 'check-in'
  title: string
  questions: Array<{
    questionId: string
    format: 'multiple-choice' | 'true-false' | 'short-text'
    prompt: string
    options: string[]
    placeholder: string | null
    answer: { text: string } | { selected: number } | null
  }>
  done: boolean
}

export type StepAnswer = { questionId: string; text?: string; selected?: number }

export interface Quiz {
  assessmentId: string
  courseId: string
  kind: 'pre' | 'final'
  title: string
  description: string
  isGraded: boolean
  passingScore: number
  maxAttempts: number
  attemptsUsed: number
  passed: boolean
  questions: Array<{ questionId: string; text: string; options: string[] }>
}

export interface QuizResult {
  assessmentId: string
  kind: 'pre' | 'final'
  isGraded: boolean
  score: number
  passed: boolean
  passingScore: number
  correctCount: number
  gradedCount: number
  attemptsUsed: number
  maxAttempts: number
  canRetake: boolean
}

export interface TutorApi {
  state(opts: { courseId?: string | null; introSeen?: string[] }): Promise<CourseState>
  unitIntro(unitId: string): Promise<UnitIntro>
  unitMaterial(unitId: string): Promise<unknown>
  video(learningBlockId: string): Promise<VideoLesson>
  step(learningBlockId: string): Promise<QuestionStep>
  submitStep(learningBlockId: string, answers: StepAnswer[]): Promise<void>
  quiz(assessmentId: string): Promise<Quiz>
  submitQuiz(assessmentId: string, answers: Array<{ questionId: string; selectedIndex: number }>): Promise<QuizResult>
  complete(learningBlockIds: string[]): Promise<void>
}

const BASE = '/api/multi-learning'

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch<{ data: T }>(`${BASE}${path}`)
  return res.data
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch<{ data: T }>(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) })
  return res.data
}

export const tutorApi: TutorApi = {
  state: ({ courseId, introSeen }) => {
    const params = new URLSearchParams()
    if (courseId) params.set('courseId', courseId)
    if (introSeen?.length) params.set('introSeen', introSeen.join(','))
    const q = params.toString()
    return get<CourseState>(`/state${q ? `?${q}` : ''}`)
  },
  unitIntro: (unitId) => get<UnitIntro>(`/units/${unitId}/intro`),
  unitMaterial: (unitId) => get<unknown>(`/units/${unitId}/material`),
  video: (id) => get<VideoLesson>(`/videos/${id}`),
  step: (id) => get<QuestionStep>(`/steps/${id}`),
  submitStep: async (id, answers) => {
    await post(`/steps/${id}/submit`, { answers })
  },
  quiz: (id) => get<Quiz>(`/quizzes/${id}`),
  submitQuiz: (id, answers) => post<QuizResult>(`/quizzes/${id}/submit`, { answers }),
  complete: async (learningBlockIds) => {
    if (learningBlockIds.length === 0) return
    await post('/progress/complete', { learningBlockIds })
  },
}

/** A readable message from an API error body (apiFetch throws the parsed body). */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const msg = (e as { error?: { message?: unknown } } | null)?.error?.message
  return typeof msg === 'string' && msg ? msg : e instanceof Error && e.message ? e.message : fallback
}
