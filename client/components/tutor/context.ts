import { createContext, useContext } from 'react'
import type { CourseState, NextStep, TutorApi, UnitStep } from './api'
import type { TutorStrings } from './strings'

export interface TutorSession {
  ui: TutorStrings
  api: TutorApi
  state: CourseState | null
  running: boolean
  /**
   * The "card in hand": the newest show_* call that matches the course
   * state's NEXT STEP, or simply the newest. Only it carries the lesson's
   * action; older copies show a quiet "done" mark.
   */
  latestCallId: string | null
  /** Where the learner is, for the course rail's "Now" marker. */
  now: NextStep | null
  /** Refresh the course state from Hadafi; resolves once Hana will see it. */
  refresh: () => Promise<CourseState | null>
  /** Open a course the learner picked, then tell Hana. */
  openCourse: (courseId: string, name: string) => Promise<void>
  /** Send a message to Hana. Hidden messages reach her but are not shown. */
  send: (text: string, opts?: { hidden?: boolean }) => Promise<void>
  /** Record that a unit's introduction was shown (units with no opening text). */
  markIntroSeen: (unitId: string) => void
  /** Describe the card in hand for Hana (e.g. the quiz question showing). */
  setOnScreen: (description: string) => void
  /** Where a step belongs, from the course state. */
  stepFor: (kind: UnitStep['kind'], id: string) => { step: UnitStep; unitOrder: number; unitName: string } | null
}

export const TutorContext = createContext<TutorSession | null>(null)

export function useTutor(): TutorSession {
  const session = useContext(TutorContext)
  if (!session) throw new Error('useTutor must be used inside TutorContext')
  return session
}
