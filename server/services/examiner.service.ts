import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { db } from '../db'
import {
  courseEnrollments,
  courses,
  examinerAttempts,
  learningBlocks,
  modules,
  units,
  userCourseProgress,
  users,
} from '../db/schema'
import { AppError } from '../utils/app-error'
import { checkBadges } from './achievements.service'
import { htmlToMarkdown } from './lms/quizGenerator.service'
import { SERVER_CLAIMS } from './serviceTokenClaims'

/**
 * The AI Examiner (ported from SMEEP 7c7331f, 4744f93 and 21abecf): Hana plays
 * a customer of the learner's own business and tests what one of her courses
 * teaches, in text, voice or video, on potential-ai's `smeepExaminer` graph
 * (which takes Hana's persona from the token's platformId, `hadafi`).
 *
 * What the browser can and can't do:
 * - It runs the role-play with the agent directly (its own user token).
 * - It can't mark the exam. When the examiner ends the role-play, the page
 *   names the exam's thread and this server asks potential-ai's grader
 *   (POST /api/examiner/grade, server-scoped token for this learner) to mark
 *   the transcript potential-ai holds for that learner's thread. Any score,
 *   scorecard or transcript the page sends is ignored.
 * - Attempts are for published courses the learner is enrolled in, and are
 *   kept per learner: each learner reads only her own.
 *
 * The examiner is practice. It awards one badge ("Real-world ready", 70 or
 * more) and no points or certificates.
 */

// ---------------------------------------------------------------------------
// potential-ai
// ---------------------------------------------------------------------------

const NOT_SET_UP = () => new AppError('The AI Examiner is not set up yet.', 503, 'AI_NOT_CONFIGURED')

function aiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  if (!base) throw NOT_SET_UP()
  return base.replace(/\/$/, '')
}

/** A 5-minute server-scoped token for one call on this learner's behalf. */
function serverToken(userId: string): string {
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!secret) throw NOT_SET_UP()
  return jwt.sign({ platformId: 'hadafi', userId, ...SERVER_CLAIMS }, secret, { algorithm: 'HS256', expiresIn: 300 })
}

// ---------------------------------------------------------------------------
// Anam (video mode): the avatar renders Hana's face and voice in
// CUSTOMER_CLIENT_V1 ("custom LLM") mode, so the exam itself still runs on
// the examiner graph. Minting a session needs ANAM_API_KEY, which must never
// reach the browser.
// ---------------------------------------------------------------------------

export async function createAnamSessionToken(): Promise<{ sessionToken: string }> {
  const apiKey = process.env['ANAM_API_KEY']?.trim()
  const avatarId = process.env['ANAM_AVATAR_ID']?.trim()
  const voiceId = process.env['ANAM_VOICE_ID']?.trim()
  if (!apiKey || !avatarId || !voiceId) {
    throw new AppError('Video exams are not available yet.', 503, 'ANAM_NOT_CONFIGURED')
  }
  const base = (process.env['ANAM_API_URL'] || 'https://api.anam.ai').replace(/\/$/, '')

  let res: Response
  try {
    res = await fetch(`${base}/v1/auth/session-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ personaConfig: { name: 'Hana', avatarId, voiceId, llmId: 'CUSTOMER_CLIENT_V1' } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AppError('The video call could not start. Please try again.', 502, 'ANAM_UNREACHABLE')
  }
  if (!res.ok) throw new AppError('The video call could not start. Please try again.', 502, 'ANAM_REQUEST_FAILED')
  const data = (await res.json().catch(() => null)) as { sessionToken?: unknown } | null
  if (typeof data?.sessionToken !== 'string' || !data.sessionToken) {
    throw new AppError('The video call could not start. Please try again.', 502, 'ANAM_BAD_RESPONSE')
  }
  return { sessionToken: data.sessionToken }
}

// ---------------------------------------------------------------------------
// The exam's inputs: who is examined, which courses, the course reference
// ---------------------------------------------------------------------------

/** Who is being examined: what the page sends the agent as __examiner_learner__. */
export async function getExamineeProfile(userId: string) {
  const [row] = await db
    .select({ fullName: users.fullName, company: users.company, country: users.country, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  return {
    firstName: (row.fullName ?? '').trim().split(/\s+/)[0] || 'there',
    fullName: row.fullName,
    company: row.company ?? null,
    country: row.country ?? null,
    role: row.role === 'sme' ? 'Entrepreneur' : row.role,
  }
}

/** Published courses the learner is enrolled in, with her studied %, most studied first. */
export async function listExaminableCourses(userId: string) {
  const rows = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      difficulty: courses.difficulty,
      cover: courses.cover,
      category: courses.category,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')))

  const ids = rows.map((r) => r.courseId)
  const progress = ids.length
    ? await db
        .select({ courseId: userCourseProgress.courseId, pct: userCourseProgress.progressPercentage })
        .from(userCourseProgress)
        .where(and(eq(userCourseProgress.userId, userId), inArray(userCourseProgress.courseId, ids)))
    : []
  const pctOf = new Map(progress.map((p) => [p.courseId, p.pct]))

  return rows
    .map((r) => ({ ...r, progressPercentage: pctOf.get(r.courseId) ?? 0 }))
    .sort((a, b) => b.progressPercentage - a.progressPercentage)
}

/** The learner is enrolled in this course and it is published, or a 403/404. */
async function assertExaminable(userId: string, courseId: string) {
  const [course] = await db
    .select({ id: courses.id, title: courses.title, difficulty: courses.difficulty, status: courses.status })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1)
  if (!course || course.status !== 'published') throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND')
  const [enrollment] = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
    .limit(1)
  if (!enrollment) throw new AppError('Enroll in this course to be examined on it.', 403, 'NOT_ENROLLED')
  return course
}

/** Total budget, and per block so one long transcript can't starve the rest. */
const REFERENCE_CHAR_BUDGET = 9000
const BLOCK_EXCERPT_CHARS = 700

/**
 * The condensed course content the examiner uses as its syllabus (and the
 * grader judges against): modules, units and trimmed teaching text from each
 * lesson. Built here so the browser never ships the whole course.
 */
export async function buildCourseReference(userId: string, courseId: string) {
  const course = await assertExaminable(userId, courseId)

  const mods = await db
    .select({ id: modules.id, title: modules.title })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.order))
  const modIds = mods.map((m) => m.id)
  const unitRows = modIds.length
    ? await db
        .select({ id: units.id, moduleId: units.moduleId, title: units.title })
        .from(units)
        .where(inArray(units.moduleId, modIds))
        .orderBy(asc(units.order))
    : []
  const unitIds = unitRows.map((u) => u.id)
  const blocks = unitIds.length
    ? await db
        .select({
          unitId: learningBlocks.unitId,
          title: learningBlocks.title,
          type: learningBlocks.type,
          body: learningBlocks.body,
          transcript: learningBlocks.transcript,
        })
        .from(learningBlocks)
        .where(inArray(learningBlocks.unitId, unitIds))
        .orderBy(asc(learningBlocks.order))
    : []

  const byUnit = new Map<string, typeof blocks>()
  for (const b of blocks) {
    const list = byUnit.get(b.unitId) ?? []
    list.push(b)
    byUnit.set(b.unitId, list)
  }

  const lines: string[] = []
  let used = 0
  const push = (line: string) => {
    if (used + line.length > REFERENCE_CHAR_BUDGET) return false
    lines.push(line)
    used += line.length + 1
    return true
  }
  outer: for (const mod of mods) {
    if (!push(`MODULE: ${mod.title}`)) break
    for (const unit of unitRows.filter((u) => u.moduleId === mod.id)) {
      if (!push(`  UNIT: ${unit.title}`)) break outer
      for (const b of byUnit.get(unit.id) ?? []) {
        const text = htmlToMarkdown(b.body || b.transcript || '').replace(/\s+/g, ' ').trim()
        if (!text) continue
        if (!push(`    ${b.title || b.type}: ${text.slice(0, BLOCK_EXCERPT_CHARS)}`)) break outer
      }
    }
  }

  return {
    courseId: course.id,
    title: course.title,
    difficulty: course.difficulty,
    reference: lines.join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export const EXAM_MODES = ['text', 'voice', 'video'] as const
export const DIMENSION_KEYS = ['courseKnowledge', 'application', 'communication', 'problemSolving', 'professionalism'] as const

/** Thread ids the page may name (it sends a UUID); matches potential-ai's rule. */
const THREAD_ID = /^[A-Za-z0-9_.-]{1,128}$/

export interface SaveAttemptInput {
  courseId: string
  mode: (typeof EXAM_MODES)[number]
  /** The page's name for the scenario; the grader's own wins when it gives one. */
  scenario?: string
  /**
   * The exam's CopilotKit thread id. potential-ai reads the transcript from
   * that thread's server-held state, scoped to this learner, so the page
   * can't supply or edit it. Anything else the page sends is ignored.
   */
  threadId: string
}

type TranscriptLine = { role: 'customer' | 'learner'; text: string }

interface Scorecard {
  scenario: string
  overallScore: number
  dimensions: Record<string, number>
  strengths: string[]
  improvements: string[]
  feedback: string
}

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100

const GRADING_FAILED = () =>
  new AppError("Your exam couldn't be marked right now. Please try again in a moment.", 503, 'GRADING_UNAVAILABLE')
const NO_EXAM = () => new AppError('This exam session has ended. Please start the exam again.', 409, 'EXAM_NOT_FOUND')
const EMPTY_ATTEMPT = () => new AppError('Answer at least one question before getting feedback.', 400, 'EMPTY_ATTEMPT')

/**
 * Marks an attempt with potential-ai. The grader reads the exam's transcript
 * from the learner's own thread there (named by `threadId`, scoped by the
 * token's user) against the course.
 */
async function gradeAttempt(
  userId: string,
  payload: { course: { title: string; difficulty?: string; reference: string }; scenario?: string; threadId: string },
): Promise<Scorecard & { transcript: TranscriptLine[] }> {
  const url = `${aiBaseUrl()}/api/examiner/grade`
  const token = serverToken(userId)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    throw GRADING_FAILED()
  }
  if (res.status === 409) throw NO_EXAM()
  if (res.status === 400) {
    const err = (await res.json().catch(() => null)) as { error?: { code?: string } } | null
    if (err?.error?.code === 'empty_attempt') throw EMPTY_ATTEMPT()
    throw GRADING_FAILED()
  }
  if (!res.ok) throw GRADING_FAILED()
  const body = (await res.json().catch(() => null)) as { data?: Scorecard & { transcript?: unknown } } | null
  if (!body?.data) throw GRADING_FAILED()
  return { ...body.data, transcript: validTranscript(body.data.transcript) }
}

/** The transcript potential-ai marked, checked before it is stored. */
function validTranscript(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 80) throw GRADING_FAILED()
  const lines = raw.map((line) => {
    const l = line as { role?: unknown; text?: unknown } | null
    if (!l || (l.role !== 'customer' && l.role !== 'learner') || typeof l.text !== 'string') throw GRADING_FAILED()
    return { role: l.role, text: l.text.slice(0, 2000) } as TranscriptLine
  })
  if (!lines.some((l) => l.role === 'learner' && l.text.trim())) throw EMPTY_ATTEMPT()
  return lines
}

/** Checks the grader's scorecard shape and bounds: its output is input like any other. */
function validScorecard(card: Scorecard, fallbackScenario: string): Scorecard {
  if (!isScore(card.overallScore)) throw GRADING_FAILED()
  const dims: Record<string, number> = {}
  for (const key of DIMENSION_KEYS) {
    const v = card.dimensions?.[key]
    if (!isScore(v)) throw GRADING_FAILED()
    dims[key] = v
  }
  const strlist = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 6) throw GRADING_FAILED()
    return v.map((x) => {
      if (typeof x !== 'string' || !x.trim()) throw GRADING_FAILED()
      return x.trim().slice(0, 400)
    })
  }
  if (typeof card.feedback !== 'string' || !card.feedback.trim()) throw GRADING_FAILED()
  const scenario = typeof card.scenario === 'string' && card.scenario.trim() ? card.scenario.trim() : fallbackScenario
  return {
    scenario: scenario.slice(0, 300),
    overallScore: card.overallScore,
    dimensions: dims,
    strengths: strlist(card.strengths),
    improvements: strlist(card.improvements),
    feedback: card.feedback.trim().slice(0, 4000),
  }
}

const RESULT = {
  id: examinerAttempts.id,
  createdAt: examinerAttempts.createdAt,
  courseId: examinerAttempts.courseId,
  mode: examinerAttempts.mode,
  scenario: examinerAttempts.scenario,
  overallScore: examinerAttempts.overallScore,
  dimensions: examinerAttempts.dimensions,
  strengths: examinerAttempts.strengths,
  improvements: examinerAttempts.improvements,
  feedback: examinerAttempts.feedback,
}

async function attemptForThread(userId: string, threadId: string) {
  const [row] = await db
    .select(RESULT)
    .from(examinerAttempts)
    .where(and(eq(examinerAttempts.userId, userId), eq(examinerAttempts.threadId, threadId)))
    .limit(1)
  return row ?? null
}

/**
 * Marks and stores one finished attempt. The page names the exam (its
 * thread); potential-ai supplies the transcript from that thread and the
 * score. One exam is marked once: asking again returns the stored result.
 */
export async function saveAttempt(userId: string, input: SaveAttemptInput) {
  const pageScenario = input.scenario?.trim() ? input.scenario.trim().slice(0, 300) : 'Practice exam'
  if (!THREAD_ID.test(input.threadId)) throw new AppError('Invalid exam session', 400, 'INVALID_ATTEMPT')

  const course = await buildCourseReference(userId, input.courseId)

  const already = await attemptForThread(userId, input.threadId)
  if (already) return already

  const graded = await gradeAttempt(userId, {
    course: { title: course.title, difficulty: String(course.difficulty), reference: course.reference.slice(0, 60_000) },
    scenario: pageScenario,
    threadId: input.threadId,
  })
  const card = validScorecard(graded, pageScenario)

  const [row] = await db
    .insert(examinerAttempts)
    .values({
      userId,
      courseId: input.courseId,
      threadId: input.threadId,
      mode: input.mode,
      scenario: card.scenario,
      overallScore: card.overallScore,
      dimensions: card.dimensions,
      strengths: card.strengths,
      improvements: card.improvements,
      feedback: card.feedback,
      transcript: graded.transcript,
    })
    .onConflictDoNothing()
    .returning(RESULT)
  // A second request for the same exam that finished first wins; return its row.
  const saved = row ?? (await attemptForThread(userId, input.threadId))
  if (!saved) throw GRADING_FAILED()
  await checkBadges(userId)
  return saved
}

/** The learner's own attempt history, newest first, without transcripts. */
export async function listAttempts(userId: string, limit: number) {
  const capped = Math.min(Math.max(Number.isFinite(limit) ? limit : 10, 1), 50)
  return db
    .select({
      id: examinerAttempts.id,
      courseId: examinerAttempts.courseId,
      courseTitle: courses.title,
      mode: examinerAttempts.mode,
      scenario: examinerAttempts.scenario,
      overallScore: examinerAttempts.overallScore,
      dimensions: examinerAttempts.dimensions,
      createdAt: examinerAttempts.createdAt,
    })
    .from(examinerAttempts)
    .innerJoin(courses, eq(courses.id, examinerAttempts.courseId))
    .where(eq(examinerAttempts.userId, userId))
    .orderBy(desc(examinerAttempts.createdAt))
    .limit(capped)
}
