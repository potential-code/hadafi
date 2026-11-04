'use client'

/**
 * What the learner has in front of them inside a step whose state lives in a
 * child component (an exam in progress). AssessmentView reports it here; the
 * course page's Hana reads it so she knows the exact question on screen.
 * Never carries an answer key. A tiny external store rather than context:
 * AssessmentView also renders where nobody reads it. (Ported from SMEEP.)
 */
import { useSyncExternalStore } from 'react'

export type LiveExam = {
  assessmentId: string
  view: 'summary' | 'taking' | 'result'
  questionNumber?: number
  totalQuestions?: number
  question?: string
  options?: string[]
  answeredCount?: number
  score?: number | null
  passed?: boolean | null
  attemptsRemaining?: number | null
}

let exam: LiveExam | null = null
const listeners = new Set<() => void>()

export function setLiveExam(value: LiveExam | null): void {
  if (JSON.stringify(exam) === JSON.stringify(value)) return
  exam = value
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLiveExam(): LiveExam | null {
  return useSyncExternalStore(subscribe, () => exam, () => null)
}
