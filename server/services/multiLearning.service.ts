import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  blockQuestions,
  courseEnrollments,
  courses,
  learningBlocks,
  modules,
  questionAnswers,
  units,
  userCourseProgress,
  userLearningBlockProgress,
} from '../db/schema'
import {
  assertBlockCompletable,
  assertQuestionAvailable,
  saveQuestionAnswer,
  updateBlockProgress,
} from './lms/progress.service'
import { submitAttempt } from './lms/assessment.service'
import { AppError } from '../utils/app-error'
import { translateContent, type TranslationDomain } from './tutorTranslation.service'

/**
 * Multi Learning: Hana as the tutor (potential-ai's `smeepTutor` graph, which
 * serves Hadafi with Hana's persona). Ported from SMEEP's tutor.service
 * (ec12753, a906242 and the fixes after them on SMEEP main).
 *
 * Hana does not hold the course. The Multi Learning page asks this service
 * where the learner is, sends that to Hana as the course-state context entry
 * (ending in a NEXT STEP line she must follow), and renders the cards she
 * opens from the payloads built here. So:
 *
 *   - progress, step order and completion come from the database, never from
 *     the model's memory or the browser;
 *   - unit, video, question and exam cards carry Hadafi's own content, so the
 *     model can neither invent a question nor reorder options;
 *   - answer keys never leave this server; exams are marked by the classic
 *     LMS pipeline (submitAttempt), which also recalculates progress and
 *     issues the certificate.
 *
 * Completing anything goes through the same server checks as the course page
 * (assertBlockCompletable, assertQuestionAvailable, updateBlockProgress, so
 * points stay once-per-unit), plus the course page's order: nothing in a unit
 * can be completed while an earlier step, or the pre-test, is still open.
 *
 * A unit is delivered as ordered steps derived from its learning blocks, in
 * block order:
 *
 *   intro        the unit's title, description and leading text blocks
 *   video        one per video block
 *   reading      text and image blocks after a video; Hana summarises them
 *   action-plan  a question block of action-plan prompts: the learner writes
 *                their own plan
 *   check-in     any other question block (the unit's survey): the learner
 *                answers it on a card. SMEEP auto-completed these; Hadafi
 *                asks them, because the server only counts a question block
 *                once its questions are answered.
 *
 * Text block roles follow their (very consistent) titles: "Read" is the
 * video's outline, "Read More" its narration transcript, "Case Study" and
 * "Quotes" are supplements.
 *
 * Languages: English, Arabic and Urdu, as SMEEP (which also has Hindi). Every
 * card and name is served in the learner's language through the translation
 * cache (tutorTranslation.service); the unit material Hana loads stays English
 * and she writes in the learner's language. The page keeps its own labels in
 * English and shows Arabic and Urdu content right to left.
 */

export type LearnerLanguage = 'en' | 'ar' | 'ur'

export const LEARNER_LANGUAGES: readonly LearnerLanguage[] = ['en', 'ar', 'ur']

export function isLearnerLanguage(value: unknown): value is LearnerLanguage {
  return value === 'en' || value === 'ar' || value === 'ur'
}

/**
 * Translation seam. English passes through; other languages translate via the
 * shared cache (potential-ai backed, translated once per string per language).
 * Failures fall back to the English original.
 */
async function translator(
  lang: LearnerLanguage,
  texts: Array<string | null | undefined>,
  domain: TranslationDomain = 'lesson',
): Promise<(t: string) => string> {
  if (lang === 'en') return (t: string) => t
  return translateContent(texts, lang, domain)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const ZERO_WIDTH = /[​-‍﻿]/g

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(ZERO_WIDTH, '').replace(/[ \t]+/g, ' ').trim()
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&rdquo;': '"',
  '&ldquo;': '"',
}

function decodeEntities(text: string): string {
  return text.replace(/&[a-z]+;|&#\d+;/gi, (m) =>
    ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) || m : m),
  )
}

/** Lesson bodies are HTML: headings, lists, bold/italic and paragraphs as Markdown; other tags dropped. */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  let text = html.replace(ZERO_WIDTH, '')
  if (!/[<>]/.test(text)) return clean(text)

  text = text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*h([1-6])[^>]*>/gi, (_m, level) => `\n\n${'#'.repeat(Math.min(Math.max(Number(level), 2), 4))} `)
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*(p|div|ul|ol|blockquote|table|tr)[^>]*>/gi, '\n\n')
    .replace(/<\s*\/\s*(p|div|ul|ol|blockquote|table|tr)\s*>/gi, '\n\n')
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => {
      const trimmed = String(inner).trim()
      return trimmed ? `**${trimmed}**` : ''
    })
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => {
      const trimmed = String(inner).trim()
      return trimmed ? `*${trimmed}*` : ''
    })
    .replace(/<[^>]+>/g, '')

  return decodeEntities(text)
    .split('\n')
    .map((line) => clean(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/-\n+#{2,4} /g, '- ')
    .trim()
}

function listItems(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^\s*(?:-|\*|\d+\.)\s+(.*)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
}

function firstSentences(text: string, count: number, max: number): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ''
  for (const s of sentences.slice(0, count)) {
    if ((out + s).length > max) break
    out += s
  }
  return out.trim()
}

const OUTCOMES_HEADING =
  /by the end of (this|the) unit|learning outcomes|you will (be able to|learn)|learners will be able to/i

export type TextRole = 'outline' | 'transcript' | 'case-study' | 'quotes' | 'text'

export function textRoleOf(title: string | null | undefined): TextRole {
  switch (clean(title).toLowerCase()) {
    case 'read':
      return 'outline'
    case 'read more':
      return 'transcript'
    case 'case study':
      return 'case-study'
    case 'quotes':
      return 'quotes'
    default:
      return 'text'
  }
}

// ---------------------------------------------------------------------------
// Access: only published courses the learner is enrolled in
// ---------------------------------------------------------------------------

async function learnerCourseIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ courseId: courseEnrollments.courseId })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')))
  return rows.map((r) => r.courseId)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(id: string, message: string, code: string): void {
  if (!UUID_RE.test(id)) throw new AppError(message, 404, code)
}

async function assertCourseAccess(userId: string, courseId: string): Promise<void> {
  assertUuid(courseId, 'Course not available to this learner', 'COURSE_NOT_FOUND')
  const ids = await learnerCourseIds(userId)
  if (!ids.includes(courseId)) throw new AppError('Course not available to this learner', 404, 'COURSE_NOT_FOUND')
}

/** The unit's course, when it is one the learner is enrolled in. */
async function assertUnitAccess(userId: string, unitId: string): Promise<string> {
  assertUuid(unitId, 'Unit not available to this learner', 'UNIT_NOT_FOUND')
  const ids = await learnerCourseIds(userId)
  if (ids.length === 0) throw new AppError('Unit not available to this learner', 404, 'UNIT_NOT_FOUND')
  const [row] = await db
    .select({ courseId: modules.courseId })
    .from(units)
    .innerJoin(modules, eq(modules.id, units.moduleId))
    .where(and(eq(units.id, unitId), inArray(modules.courseId, ids)))
    .limit(1)
  if (!row) throw new AppError('Unit not available to this learner', 404, 'UNIT_NOT_FOUND')
  return row.courseId
}

// ---------------------------------------------------------------------------
// Course state
// ---------------------------------------------------------------------------

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

/** The course's final exam (its post assessment), with attempt state. */
export interface FinalQuiz {
  assessmentId: string
  title: string
  isGraded: boolean
  passingScore: number
  /** 0 means unlimited. */
  maxAttempts: number
  attemptsUsed: number
  bestScore: number | null
  passed: boolean
  /** Attempts used up without a pass: it can't be retaken here. */
  locked: boolean
  done: boolean
}

/** The course's pre-test, before the first unit: done once passed (graded) or taken (ungraded). */
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
  | { action: 'show_action_plan'; unitId: string; learningBlockId: string; checkIn: boolean }
  | { action: 'show_quiz'; assessmentId: string; retake: boolean; pretest: boolean }

export interface ActiveCourse {
  courseId: string
  name: string
  progress: number
  units: StateUnit[]
  preTest: PreTest | null
  finalQuiz: FinalQuiz | null
  currentUnitId: string | null
  complete: boolean
}

export interface CourseState {
  language: LearnerLanguage
  courses: CourseSummary[]
  active: ActiveCourse | null
  next: NextStep
  /** The same state as prose for the model, ending in a NEXT STEP line. */
  text: string
}

async function listCourses(userId: string, lang: LearnerLanguage): Promise<CourseSummary[]> {
  const rows = await db
    .select({ courseId: courses.id, name: courses.title })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')))
    .orderBy(asc(courseEnrollments.enrolledAt))
  if (rows.length === 0) return []
  const progress = await db
    .select({
      courseId: userCourseProgress.courseId,
      pct: userCourseProgress.progressPercentage,
      completedAt: userCourseProgress.completedAt,
    })
    .from(userCourseProgress)
    .where(and(eq(userCourseProgress.userId, userId), inArray(userCourseProgress.courseId, rows.map((r) => r.courseId))))
  const byCourse = new Map(progress.map((p) => [p.courseId, p]))
  const t = await translator(lang, rows.map((r) => clean(r.name)), 'catalogue')
  return rows.map((r) => {
    const p = byCourse.get(r.courseId)
    const percent = Math.round(Number(p?.pct ?? 0)) || 0
    return { courseId: r.courseId, name: t(clean(r.name)), progress: percent, complete: Boolean(p?.completedAt) || percent >= 100 }
  })
}

type BlockRow = { id: string; unitId: string; type: string; title: string; order: number }

/** Every unit of a course as ordered steps, with the learner's progress. */
async function buildUnits(
  userId: string,
  courseId: string,
  introSeen: ReadonlySet<string>,
  lang: LearnerLanguage = 'en',
): Promise<StateUnit[]> {
  const moduleRows = await db
    .select({ id: modules.id, title: modules.title, order: modules.order })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.order))
  const moduleIds = moduleRows.map((m) => m.id)
  const unitRows = moduleIds.length
    ? await db
        .select({ id: units.id, moduleId: units.moduleId, title: units.title, order: units.order })
        .from(units)
        .where(inArray(units.moduleId, moduleIds))
        .orderBy(asc(units.order))
    : []
  if (unitRows.length === 0) return []

  // Units across modules in course order (the course page's order).
  const moduleOrder = new Map(moduleRows.map((m, i) => [m.id, i]))
  const moduleName = new Map(moduleRows.map((m) => [m.id, m.title]))
  const ordered = [...unitRows].sort(
    (a, b) => (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || a.order - b.order,
  )

  const blockRows: BlockRow[] = await db
    .select({
      id: learningBlocks.id,
      unitId: learningBlocks.unitId,
      type: learningBlocks.type,
      title: learningBlocks.title,
      order: learningBlocks.order,
    })
    .from(learningBlocks)
    .where(inArray(learningBlocks.unitId, ordered.map((u) => u.id)))
    .orderBy(asc(learningBlocks.order))

  const questionBlockIds = blockRows.filter((b) => b.type === 'question').map((b) => b.id)
  const [blockProgress, questionKinds] = await Promise.all([
    blockRows.length
      ? db
          .select({ id: userLearningBlockProgress.learningBlockId, status: userLearningBlockProgress.status })
          .from(userLearningBlockProgress)
          .where(
            and(
              eq(userLearningBlockProgress.userId, userId),
              inArray(userLearningBlockProgress.learningBlockId, blockRows.map((b) => b.id)),
            ),
          )
      : Promise.resolve([] as Array<{ id: string; status: string }>),
    questionBlockIds.length
      ? db
          .select({ blockId: blockQuestions.blockId, kind: blockQuestions.kind })
          .from(blockQuestions)
          .where(inArray(blockQuestions.blockId, questionBlockIds))
      : Promise.resolve([] as Array<{ blockId: string; kind: string }>),
  ])

  const completed = new Set(blockProgress.filter((p) => p.status === 'completed').map((p) => p.id))
  const kindsOf = new Map<string, string[]>()
  for (const q of questionKinds) kindsOf.set(q.blockId, [...(kindsOf.get(q.blockId) ?? []), q.kind])
  const t = await translator(
    lang,
    [...ordered.map((u) => clean(u.title)), ...moduleRows.map((m) => clean(m.title)), ...blockRows.filter((b) => b.type === 'video').map((b) => clean(b.title))],
    'catalogue',
  )

  return ordered.map((unit, index) => {
    const blocks = blockRows.filter((b) => b.unitId === unit.id)
    const steps: UnitStep[] = []

    // Leading text blocks are the introduction.
    let i = 0
    const introBlockIds: string[] = []
    while (i < blocks.length && blocks[i]!.type === 'text') introBlockIds.push(blocks[i++]!.id)

    let reading: string[] = []
    const flushReading = () => {
      if (reading.length === 0) return
      steps.push({ kind: 'reading', unitId: unit.id, blockIds: reading, done: reading.every((id) => completed.has(id)) })
      reading = []
    }
    for (; i < blocks.length; i++) {
      const b = blocks[i]!
      const kinds = b.type === 'question' ? (kindsOf.get(b.id) ?? []) : []
      // Text, images and empty question blocks are read with the summary.
      if (b.type === 'text' || b.type === 'image' || (b.type === 'question' && kinds.length === 0)) {
        reading.push(b.id)
        continue
      }
      flushReading()
      if (b.type === 'video') {
        steps.push({ kind: 'video', unitId: unit.id, blockId: b.id, title: t(clean(b.title)), done: completed.has(b.id) })
      } else if (b.type === 'question') {
        const kind = kinds.every((k) => k === 'action-plan') ? 'action-plan' : 'check-in'
        steps.push({ kind, unitId: unit.id, blockId: b.id, done: completed.has(b.id) })
      }
    }
    flushReading()

    // The intro is done once anything in the unit is, or its opening text is
    // recorded, or (no opening text) the page says it was shown this session.
    const introDone =
      steps.some((s) => s.done) ||
      introSeen.has(unit.id) ||
      (introBlockIds.length > 0 && introBlockIds.every((id) => completed.has(id)))
    steps.unshift({ kind: 'intro', unitId: unit.id, blockIds: introBlockIds, done: introDone })

    return {
      unitId: unit.id,
      name: t(clean(unit.title)),
      moduleName: t(clean(moduleName.get(unit.moduleId) ?? '')),
      order: index + 1,
      // Complete the way the server counts it: every block done.
      complete: blocks.length > 0 ? blocks.every((b) => completed.has(b.id)) : steps.every((s) => s.done),
      steps,
    }
  })
}

async function attemptsFor(userId: string, assessmentId: string) {
  return db
    .select({ score: assessmentAttempts.score, passed: assessmentAttempts.passed })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessmentId)))
}

async function assessmentOf(courseId: string, type: 'pre' | 'post') {
  const [row] = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      isGraded: assessments.isGraded,
      passingScore: assessments.passingScore,
      maxAttempts: assessments.maxAttempts,
    })
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.assessmentType, type)))
    .limit(1)
  return row ?? null
}

async function buildPreTest(userId: string, courseId: string, lang: LearnerLanguage = 'en'): Promise<PreTest | null> {
  const a = await assessmentOf(courseId, 'pre')
  if (!a) return null
  const attempts = await attemptsFor(userId, a.id)
  const t = await translator(lang, [clean(a.title)])
  return {
    assessmentId: a.id,
    title: t(clean(a.title)),
    isGraded: a.isGraded,
    passingScore: a.passingScore,
    attemptsUsed: attempts.length,
    // As the course page counts it (computeLockStatus / recalculateCourseProgress).
    done: a.isGraded ? attempts.some((x) => x.passed === true) : attempts.length > 0,
  }
}

async function buildFinalQuiz(userId: string, courseId: string, lang: LearnerLanguage = 'en'): Promise<FinalQuiz | null> {
  const a = await assessmentOf(courseId, 'post')
  if (!a) return null
  const attempts = await attemptsFor(userId, a.id)
  const passed = a.isGraded ? attempts.some((x) => x.passed === true) : attempts.length > 0
  const locked = !passed && a.maxAttempts > 0 && attempts.length >= a.maxAttempts
  const scores = attempts.map((x) => x.score).filter((s): s is number => typeof s === 'number')
  const t = await translator(lang, [clean(a.title)])
  return {
    assessmentId: a.id,
    title: t(clean(a.title)),
    isGraded: a.isGraded,
    passingScore: a.passingScore,
    maxAttempts: a.maxAttempts,
    attemptsUsed: attempts.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    passed,
    locked,
    done: passed || locked,
  }
}

function nextStepOf(unitsList: StateUnit[], finalQuiz: FinalQuiz | null, preTest: PreTest | null): NextStep {
  if (preTest && !preTest.done) {
    return { action: 'show_quiz', assessmentId: preTest.assessmentId, retake: preTest.attemptsUsed > 0, pretest: true }
  }
  for (const unit of unitsList) {
    const step = unit.steps.find((s) => !s.done)
    if (!step) continue
    switch (step.kind) {
      case 'intro':
        return { action: 'show_unit_intro', unitId: unit.unitId }
      case 'video':
        return { action: 'show_video', unitId: unit.unitId, learningBlockId: step.blockId }
      case 'reading':
        return { action: 'show_summary', unitId: unit.unitId }
      case 'action-plan':
      case 'check-in':
        return { action: 'show_action_plan', unitId: unit.unitId, learningBlockId: step.blockId, checkIn: step.kind === 'check-in' }
    }
  }
  if (finalQuiz && !finalQuiz.done) {
    return { action: 'show_quiz', assessmentId: finalQuiz.assessmentId, retake: finalQuiz.attemptsUsed > 0, pretest: false }
  }
  return { action: 'show_courses', reason: finalQuiz?.locked ? 'quiz_not_passed' : 'course_complete' }
}

function stepLabel(step: UnitStep): string {
  const mark = step.done ? 'done' : 'to do'
  switch (step.kind) {
    case 'intro':
      return `introduction (${mark})`
    case 'video':
      return `video learningBlockId=${step.blockId} (${mark})`
    case 'reading':
      return `reading and summary (${mark})`
    case 'action-plan':
      return `action plan learningBlockId=${step.blockId} (${mark})`
    case 'check-in':
      return `unit check-in learningBlockId=${step.blockId} (${mark})`
  }
}

function finalQuizLabel(quiz: FinalQuiz): string {
  const result = quiz.passed
    ? quiz.isGraded
      ? `PASSED, best score ${quiz.bestScore}%`
      : 'taken'
    : quiz.locked
      ? `NOT PASSED and locked after ${quiz.attemptsUsed} attempts`
      : `${quiz.attemptsUsed}${quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ''} attempts used${quiz.bestScore !== null ? `, best score ${quiz.bestScore}%` : ''}`
  return `Final exam (assessmentId=${quiz.assessmentId}) ${quiz.title}: ${result}${quiz.isGraded ? `; pass mark ${quiz.passingScore}%` : ''}`
}

function nextStepText(next: NextStep, preTest: PreTest | null): string {
  switch (next.action) {
    case 'show_courses':
      if (next.reason === 'course_complete') {
        return "The active course is COMPLETE. Congratulate the learner in one short sentence, then show the learner's courses (show_courses)."
      }
      if (next.reason === 'quiz_not_passed') {
        return "Every lesson of this course has been taken, but the final exam was NOT passed and has no attempts left, so the course is NOT complete. Say so kindly in one sentence: the Hadafi team can reset that exam. Never congratulate them on finishing. Then show the learner's courses (show_courses)."
      }
      return "No course is open. Show the learner's courses (show_courses) so they can choose one."
    case 'show_unit_intro':
      return `Show the unit introduction: show_unit_intro with unitId=${next.unitId}.`
    case 'show_video':
      return `Show the video: show_video with learningBlockId=${next.learningBlockId}.`
    case 'show_summary':
      return `Summarise the unit with unitId=${next.unitId}: call load_unit with unitId=${next.unitId} if its material is not loaded in this conversation, then show_summary with unitId=${next.unitId}.`
    case 'show_action_plan':
      return next.checkIn
        ? `Show the unit's check-in questions: show_action_plan with learningBlockId=${next.learningBlockId}. It is a short reflection with no wrong answers; the learner answers on the card. Never answer for them.`
        : `Show the unit's action plan: show_action_plan with learningBlockId=${next.learningBlockId}. The learner writes their own plan on the card; never write it for them.`
    case 'show_quiz':
      if (next.pretest) {
        const gate = preTest?.isGraded
          ? ` The lessons open once it reaches its pass mark of ${preTest.passingScore}%.${next.retake ? ' This is another try; encourage the learner briefly, and never call an earlier try a failure.' : ''}`
          : ' Taking it opens the lessons.'
        return `Show the pre-test: show_quiz with assessmentId=${next.assessmentId}. It comes before the first unit: a quick check of what the learner already knows, so their progress can be measured.${gate}`
      }
      return `Show the final exam: show_quiz with assessmentId=${next.assessmentId}.${next.retake ? ' This is a retake; encourage the learner briefly.' : ''}`
  }
}

function stateText(coursesList: CourseSummary[], active: ActiveCourse | null, next: NextStep): string {
  const lines: string[] = []
  lines.push(
    coursesList.length
      ? `Enrolled courses: ${coursesList
          .map((c) => `${c.name} (courseId=${c.courseId}, ${c.complete ? 'COMPLETE' : `${c.progress}%`})`)
          .join('; ')}.`
      : 'The learner is not enrolled in any course.',
  )
  if (active) {
    const done = active.units.filter((u) => u.complete).length
    lines.push(
      `Active course (courseId=${active.courseId}) ${active.name}, ${done} of ${active.units.length} units COMPLETE${active.complete ? ' — the course is COMPLETE' : ''}.`,
    )
    if (active.preTest) {
      lines.push(`- Pre-test (assessmentId=${active.preTest.assessmentId}): ${active.preTest.done ? 'done' : 'to do, before the first unit'}`)
    }
    for (const unit of active.units) {
      lines.push(
        `- Unit ${unit.order} (unitId=${unit.unitId}) ${unit.name}: ${unit.complete ? 'COMPLETE' : unit.steps.map(stepLabel).join(', ')}${unit.unitId === active.currentUnitId ? ' ← current' : ''}`,
      )
    }
    if (active.finalQuiz) lines.push(`- ${finalQuizLabel(active.finalQuiz)}`)
  } else {
    lines.push('No active course.')
  }
  lines.push(`NEXT STEP: ${nextStepText(next, active?.preTest ?? null)}`)
  return lines.join('\n')
}

async function buildActive(
  userId: string,
  courseId: string,
  introSeen: ReadonlySet<string>,
  coursesList: CourseSummary[],
  lang: LearnerLanguage,
) {
  const [unitsList, finalQuiz, preTest] = await Promise.all([
    buildUnits(userId, courseId, introSeen, lang),
    buildFinalQuiz(userId, courseId, lang),
    buildPreTest(userId, courseId, lang),
  ])
  const summary = coursesList.find((c) => c.courseId === courseId)
  const next = nextStepOf(unitsList, finalQuiz, preTest)
  const active: ActiveCourse = {
    courseId,
    name: summary?.name ?? '',
    progress: summary?.progress ?? 0,
    units: unitsList,
    preTest,
    finalQuiz,
    currentUnitId: 'unitId' in next ? next.unitId : null,
    complete: unitsList.length > 0 && unitsList.every((u) => u.complete) && (!finalQuiz || finalQuiz.passed),
  }
  return { active, next }
}

/**
 * Where the learner is, as data for the page (course rail) and as prose for
 * Hana. `introSeen` carries units whose introduction was shown this session
 * but have no opening text to record it by.
 */
export async function getCourseState(
  userId: string,
  options: { courseId?: string | null; introSeen?: string[]; lang?: LearnerLanguage } = {},
): Promise<CourseState> {
  const lang = options.lang ?? 'en'
  // Access first: nothing is translated for a course the learner can't see.
  if (options.courseId) await assertCourseAccess(userId, options.courseId)
  const coursesList = await listCourses(userId, lang)
  let active: ActiveCourse | null = null
  let next: NextStep = { action: 'show_courses', reason: 'no_active_course' }
  if (options.courseId) {
    const built = await buildActive(userId, options.courseId, new Set(options.introSeen ?? []), coursesList, lang)
    active = built.active
    next = built.next
  }
  return { language: lang, courses: coursesList, active, next, text: stateText(coursesList, active, next) }
}

// ---------------------------------------------------------------------------
// Order: what the course page would let the learner do now
// ---------------------------------------------------------------------------

/**
 * Refuses blocks the learner hasn't reached: the course page locks every unit
 * until the pre-test is done, and each block until the ones before it are
 * (learner.service computeLockStatus). Blocks completed together in one call
 * (a reading step's text blocks) count for each other.
 */
async function assertReachable(userId: string, courseId: string, blockIds: string[]): Promise<void> {
  const [unitsList, preTest] = await Promise.all([buildUnits(userId, courseId, new Set()), buildPreTest(userId, courseId)])
  if (preTest && !preTest.done) throw new AppError('Take the pre-test first', 409, 'STEP_LOCKED')

  // Every block of the course in course order, with whether it is done.
  const moduleIds = (await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId))).map((m) => m.id)
  const unitIds = unitsList.map((u) => u.unitId)
  if (!moduleIds.length || !unitIds.length) throw new AppError('Learning block not found', 404, 'BLOCK_NOT_FOUND')
  const rows = await db
    .select({ id: learningBlocks.id, unitId: learningBlocks.unitId, order: learningBlocks.order })
    .from(learningBlocks)
    .where(inArray(learningBlocks.unitId, unitIds))
  const unitIndex = new Map(unitIds.map((id, i) => [id, i]))
  rows.sort((a, b) => (unitIndex.get(a.unitId)! - unitIndex.get(b.unitId)!) || a.order - b.order)
  const done = new Set(
    (
      await db
        .select({ id: userLearningBlockProgress.learningBlockId })
        .from(userLearningBlockProgress)
        .where(
          and(
            eq(userLearningBlockProgress.userId, userId),
            eq(userLearningBlockProgress.status, 'completed'),
            inArray(userLearningBlockProgress.learningBlockId, rows.map((r) => r.id)),
          ),
        )
    ).map((r) => r.id),
  )
  const batch = new Set(blockIds)
  for (const id of blockIds) {
    const at = rows.findIndex((r) => r.id === id)
    if (at < 0) throw new AppError('Learning block not found', 404, 'BLOCK_NOT_FOUND')
    const open = rows.slice(0, at).find((r) => !done.has(r.id) && !batch.has(r.id))
    if (open) throw new AppError('Finish the earlier steps first', 409, 'STEP_LOCKED')
  }
}

async function courseOfBlocks(userId: string, blockIds: string[]) {
  const ids = [...new Set(blockIds)]
  for (const id of ids) assertUuid(id, 'Learning block not found', 'BLOCK_NOT_FOUND')
  const rows = await db
    .select({ id: learningBlocks.id, unitId: learningBlocks.unitId, type: learningBlocks.type, courseId: modules.courseId })
    .from(learningBlocks)
    .innerJoin(units, eq(units.id, learningBlocks.unitId))
    .innerJoin(modules, eq(modules.id, units.moduleId))
    .where(inArray(learningBlocks.id, ids))
  if (rows.length !== ids.length) throw new AppError('Learning block not found', 404, 'BLOCK_NOT_FOUND')
  const courseIds = new Set(rows.map((r) => r.courseId))
  if (courseIds.size !== 1) throw new AppError('Complete one course at a time', 400, 'VALIDATION_FAILED')
  const courseId = rows[0]!.courseId
  await assertCourseAccess(userId, courseId)
  return { courseId, rows }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

async function unitWithBlocks(unitId: string) {
  const [unit] = await db
    .select({ id: units.id, title: units.title, description: units.description })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1)
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND')
  const blocks = await db
    .select({
      id: learningBlocks.id,
      type: learningBlocks.type,
      title: learningBlocks.title,
      body: learningBlocks.body,
      transcript: learningBlocks.transcript,
      videoUrl: learningBlocks.videoUrl,
    })
    .from(learningBlocks)
    .where(eq(learningBlocks.unitId, unitId))
    .orderBy(asc(learningBlocks.order))
  return { unit, blocks }
}

export interface UnitIntroCard {
  unitId: string
  title: string
  description: string
  introduction: string
  outcomes: string[]
}

export async function getUnitIntro(userId: string, unitId: string, lang: LearnerLanguage = 'en'): Promise<UnitIntroCard> {
  await assertUnitAccess(userId, unitId)
  const { unit, blocks } = await unitWithBlocks(unitId)
  const leading: string[] = []
  for (const b of blocks) {
    if (b.type !== 'text') break
    const text = htmlToMarkdown(b.body)
    if (text) leading.push(text)
  }
  // Video-first units: the "Read" outline is the right preview.
  if (leading.length === 0) {
    const outline = blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'outline')
    const text = htmlToMarkdown(outline?.body)
    if (text) leading.push(text)
  }
  // No description and no outline: the transcript's opening sentences.
  if (leading.length === 0 && !htmlToMarkdown(unit.description)) {
    const transcript = blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'transcript')
    const plain = htmlToMarkdown(transcript?.body).replace(/^#{1,6}\s*/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ')
    const opening = firstSentences(plain, 2, 320)
    if (opening) leading.push(opening)
  }

  let outcomes: string[] = []
  const introduction: string[] = []
  for (const text of leading) {
    const items = listItems(text)
    if (outcomes.length === 0 && items.length > 0 && OUTCOMES_HEADING.test(text)) outcomes = items
    else introduction.push(text)
  }
  const description = htmlToMarkdown(unit.description)
  const same = (a: string, b: string) =>
    a.replace(/\W+/g, ' ').trim().toLowerCase() === b.replace(/\W+/g, ' ').trim().toLowerCase()
  const intro = introduction.filter((text) => !description || !same(text, description)).join('\n\n')
  const title = clean(unit.title)
  const t = await translator(lang, [title, description, intro, ...outcomes])
  return {
    unitId,
    title: t(title),
    description: description && t(description),
    introduction: intro && t(intro),
    outcomes: outcomes.map(t),
  }
}

export interface VideoCard {
  learningBlockId: string
  unitId: string
  title: string
  videoUrl: string
  transcript: string
}

export async function getVideo(userId: string, learningBlockId: string, lang: LearnerLanguage = 'en'): Promise<VideoCard> {
  assertUuid(learningBlockId, 'Video not found', 'VIDEO_NOT_FOUND')
  const [block] = await db
    .select({
      id: learningBlocks.id,
      unitId: learningBlocks.unitId,
      type: learningBlocks.type,
      title: learningBlocks.title,
      videoUrl: learningBlocks.videoUrl,
      transcript: learningBlocks.transcript,
    })
    .from(learningBlocks)
    .where(eq(learningBlocks.id, learningBlockId))
    .limit(1)
  if (!block || block.type !== 'video' || !block.videoUrl) throw new AppError('Video not found', 404, 'VIDEO_NOT_FOUND')
  await assertUnitAccess(userId, block.unitId)
  // Many video blocks are titled just "Video"; the unit's name reads better.
  let title = clean(block.title)
  if (!title || /^video$/i.test(title)) {
    const [unit] = await db.select({ title: units.title }).from(units).where(eq(units.id, block.unitId)).limit(1)
    title = clean(unit?.title) || title
  }
  const t = await translator(lang, [title], 'catalogue')
  return {
    learningBlockId: block.id,
    unitId: block.unitId,
    title: t(title),
    videoUrl: block.videoUrl,
    transcript: htmlToMarkdown(block.transcript).slice(0, 6000),
  }
}

/** Quizzes the tutor runs: the course's pre-test and final exam. */
function isTutorQuiz(a: { assessmentType: string }): boolean {
  return a.assessmentType === 'pre' || a.assessmentType === 'post'
}

export interface QuizCard {
  assessmentId: string
  courseId: string
  kind: 'pre' | 'final'
  title: string
  description: string
  isGraded: boolean
  passingScore: number
  /** 0 means unlimited. */
  maxAttempts: number
  attemptsUsed: number
  passed: boolean
  questions: Array<{ questionId: string; text: string; options: string[] }>
}

async function tutorAssessment(userId: string, assessmentId: string) {
  assertUuid(assessmentId, 'Quiz not found', 'QUIZ_NOT_FOUND')
  const [assessment] = await db
    .select({
      id: assessments.id,
      courseId: assessments.courseId,
      title: assessments.title,
      description: assessments.description,
      passingScore: assessments.passingScore,
      maxAttempts: assessments.maxAttempts,
      isGraded: assessments.isGraded,
      assessmentType: assessments.assessmentType,
    })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1)
  if (!assessment || !isTutorQuiz(assessment)) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')
  await assertCourseAccess(userId, assessment.courseId)
  // The final exam opens once every unit is done (the course page's lock).
  if (assessment.assessmentType === 'post') {
    const [unitsList, preTest] = await Promise.all([
      buildUnits(userId, assessment.courseId, new Set()),
      buildPreTest(userId, assessment.courseId),
    ])
    if ((preTest && !preTest.done) || !unitsList.every((u) => u.complete)) {
      throw new AppError('Finish every unit before the final exam', 409, 'QUIZ_LOCKED')
    }
  }
  return assessment
}

/** A pre-test or final exam: questions and options, never answers. */
export async function getQuiz(userId: string, assessmentId: string, lang: LearnerLanguage = 'en'): Promise<QuizCard> {
  const assessment = await tutorAssessment(userId, assessmentId)
  const rows = await db
    .select({ id: assessmentQuestions.id, text: assessmentQuestions.questionText, options: assessmentQuestions.options })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order))
  if (rows.length === 0) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')
  const attempts = await attemptsFor(userId, assessmentId)
  const title = clean(assessment.title)
  const description = htmlToMarkdown(assessment.description)
  const items = rows.map((q) => ({ questionId: q.id, text: clean(q.text), options: (q.options ?? []).map((o) => clean(o)) }))
  const t = await translator(lang, [title, description, ...items.flatMap((q) => [q.text, ...q.options])])
  return {
    assessmentId,
    courseId: assessment.courseId,
    kind: assessment.assessmentType === 'pre' ? 'pre' : 'final',
    title: t(title),
    description: description && t(description),
    isGraded: assessment.isGraded,
    passingScore: assessment.passingScore,
    maxAttempts: assessment.maxAttempts,
    attemptsUsed: attempts.length,
    passed: assessment.isGraded ? attempts.some((a) => a.passed === true) : attempts.length > 0,
    // Options stay in their stored order: marking is by position.
    questions: items.map((q) => ({ questionId: q.questionId, text: t(q.text), options: q.options.map(t) })),
  }
}

export interface QuizSubmission {
  assessmentId: string
  kind: 'pre' | 'final'
  isGraded: boolean
  score: number
  passed: boolean
  passingScore: number
  correctCount: number
  gradedCount: number
  attemptsUsed: number
  /** 0 means unlimited. */
  maxAttempts: number
  canRetake: boolean
}

/**
 * Marks a pre-test or the final exam through the classic pipeline
 * (submitAttempt: shared attempts with the course page; progress and the
 * certificate follow). The browser never sends a score or a pass.
 */
export async function submitQuiz(
  userId: string,
  assessmentId: string,
  answers: Array<{ questionId: string; selectedIndex: number }>,
): Promise<QuizSubmission> {
  const assessment = await tutorAssessment(userId, assessmentId)
  const map: Record<string, number> = {}
  for (const a of answers) map[a.questionId] = a.selectedIndex

  let summary: Awaited<ReturnType<typeof submitAttempt>>
  try {
    summary = await submitAttempt(userId, assessmentId, map)
  } catch (error) {
    if (error instanceof Error && error.message === 'MAX_ATTEMPTS_EXCEEDED') {
      throw new AppError('No attempts left for this exam', 409, 'QUIZ_LOCKED')
    }
    throw error
  }
  const score = summary.latestAttempt?.score ?? 0
  const passed = !assessment.isGraded || summary.latestAttempt?.passed === true
  const total = summary.assessment.totalQuestions
  return {
    assessmentId,
    kind: assessment.assessmentType === 'pre' ? 'pre' : 'final',
    isGraded: assessment.isGraded,
    score,
    passed,
    passingScore: summary.assessment.passingScore,
    correctCount: Math.round((score / 100) * total),
    gradedCount: total,
    attemptsUsed: summary.attemptsMade,
    maxAttempts: summary.assessment.maxAttempts,
    canRetake: !passed && summary.canStartAssessment,
  }
}

// ---------------------------------------------------------------------------
// Material for the model (load_unit)
// ---------------------------------------------------------------------------

/**
 * A unit's teaching material for Hana to summarise and answer from. "Read
 * More" (the video's narration) is attached to the video as its transcript.
 * Questions are deliberately absent.
 */
export async function getUnitMaterial(userId: string, unitId: string) {
  await assertUnitAccess(userId, unitId)
  const { unit, blocks } = await unitWithBlocks(unitId)
  const hasVideo = blocks.some((b) => b.type === 'video')
  const transcriptBlock = hasVideo ? blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'transcript') : undefined
  const transcript = htmlToMarkdown(transcriptBlock?.body ?? transcriptBlock?.transcript).slice(0, 6000)
  return {
    unitId,
    title: clean(unit.title),
    description: htmlToMarkdown(unit.description),
    blocks: blocks
      .filter((b) => b.type === 'text' || b.type === 'video')
      .filter((b) => b.id !== transcriptBlock?.id)
      .map((b) =>
        b.type === 'video'
          ? {
              learningBlockId: b.id,
              type: 'video' as const,
              title: clean(b.title),
              ...(transcript
                ? { transcript }
                : b.transcript
                  ? { transcript: htmlToMarkdown(b.transcript).slice(0, 6000) }
                  : {}),
            }
          : { learningBlockId: b.id, type: 'text' as const, role: textRoleOf(b.title), text: htmlToMarkdown(b.body).slice(0, 8000) },
      ),
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Marks lesson blocks done (opening text, a watched video, a summarised
 * reading). Question blocks with questions complete only through their
 * answers (submitQuestionStep).
 */
export async function completeBlocks(userId: string, blockIds: string[]): Promise<void> {
  const ids = [...new Set(blockIds)]
  if (ids.length === 0) return
  const { courseId, rows } = await courseOfBlocks(userId, ids)
  const questionBlocks = rows.filter((r) => r.type === 'question').map((r) => r.id)
  if (questionBlocks.length) {
    const asked = await db
      .select({ blockId: blockQuestions.blockId })
      .from(blockQuestions)
      .where(inArray(blockQuestions.blockId, questionBlocks))
    if (asked.length) throw new AppError('Answer the questions first', 409, 'BLOCK_NOT_ANSWERED')
  }
  await assertReachable(userId, courseId, ids)
  // In course order, so each completion sees the ones before it.
  const ordered = await orderInCourse(ids)
  for (const id of ordered) {
    await assertBlockCompletable(userId, id)
    await updateBlockProgress(userId, id, 'completed')
  }
}

async function orderInCourse(ids: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: learningBlocks.id, order: learningBlocks.order, unitOrder: units.order, moduleOrder: modules.order })
    .from(learningBlocks)
    .innerJoin(units, eq(units.id, learningBlocks.unitId))
    .innerJoin(modules, eq(modules.id, units.moduleId))
    .where(inArray(learningBlocks.id, ids))
  return rows
    .sort((a, b) => a.moduleOrder - b.moduleOrder || a.unitOrder - b.unitOrder || a.order - b.order)
    .map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Action plans and check-ins (question blocks)
// ---------------------------------------------------------------------------

export interface QuestionStepCard {
  learningBlockId: string
  unitId: string
  /** action-plan: the learner's own plan; check-in: the unit's reflection questions. */
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

async function questionBlockOf(learningBlockId: string) {
  assertUuid(learningBlockId, 'Step not found', 'STEP_NOT_FOUND')
  const [block] = await db
    .select({ id: learningBlocks.id, unitId: learningBlocks.unitId, type: learningBlocks.type, title: learningBlocks.title })
    .from(learningBlocks)
    .where(eq(learningBlocks.id, learningBlockId))
    .limit(1)
  if (!block || block.type !== 'question') throw new AppError('Step not found', 404, 'STEP_NOT_FOUND')
  const questions = await db
    .select({
      id: blockQuestions.id,
      kind: blockQuestions.kind,
      format: blockQuestions.format,
      prompt: blockQuestions.prompt,
      options: blockQuestions.options,
      placeholder: blockQuestions.placeholder,
    })
    .from(blockQuestions)
    .where(eq(blockQuestions.blockId, learningBlockId))
    .orderBy(asc(blockQuestions.order))
  if (questions.length === 0) throw new AppError('Step not found', 404, 'STEP_NOT_FOUND')
  return { block, questions }
}

const optionsOf = (q: { format: string; options: string[] | null }) =>
  q.format === 'true-false' ? ['True', 'False'] : q.format === 'multiple-choice' ? (q.options ?? []).map((o) => clean(o)) : []

/** The unit's action plan or check-in, with whatever the learner saved before. Never an answer key. */
export async function getQuestionStep(
  userId: string,
  learningBlockId: string,
  lang: LearnerLanguage = 'en',
): Promise<QuestionStepCard> {
  const { block, questions } = await questionBlockOf(learningBlockId)
  await assertUnitAccess(userId, block.unitId)
  const [unit] = await db.select({ title: units.title }).from(units).where(eq(units.id, block.unitId)).limit(1)
  const saved = await db
    .select({ questionId: questionAnswers.questionId, answerData: questionAnswers.answerData })
    .from(questionAnswers)
    .where(and(eq(questionAnswers.userId, userId), inArray(questionAnswers.questionId, questions.map((q) => q.id))))
  const answerOf = new Map(saved.map((s) => [s.questionId, s.answerData]))
  const [progress] = await db
    .select({ status: userLearningBlockProgress.status })
    .from(userLearningBlockProgress)
    .where(and(eq(userLearningBlockProgress.userId, userId), eq(userLearningBlockProgress.learningBlockId, learningBlockId)))
    .limit(1)
  const actionPlan = questions.every((q) => q.kind === 'action-plan')
  const title = clean(unit?.title) || clean(block.title)
  const t = await translator(lang, [
    title,
    ...questions.flatMap((q) => [clean(q.prompt), ...optionsOf(q), q.placeholder ? clean(q.placeholder) : null]),
  ])
  return {
    learningBlockId,
    unitId: block.unitId,
    kind: actionPlan ? 'action-plan' : 'check-in',
    title: t(title),
    questions: questions.map((q) => {
      const a = answerOf.get(q.id)
      return {
        questionId: q.id,
        format: q.format,
        prompt: t(clean(q.prompt)),
        // Translated for reading only: answers are still marked by position.
        options: optionsOf(q).map(t),
        placeholder: q.placeholder ? t(clean(q.placeholder)) : null,
        answer:
          typeof a?.openEndedAnswer === 'string'
            ? { text: a.openEndedAnswer }
            : typeof a?.selectedAnswer === 'number'
              ? { selected: a.selectedAnswer }
              : null,
      }
    }),
    done: progress?.status === 'completed',
  }
}

/** Longest written answer, as the course page's answer endpoint allows. */
export const MAX_ANSWER_CHARS = 10_000

/**
 * Saves the learner's answers to an action plan or check-in (the same store
 * the course page writes), then completes the block through the course page's
 * checks. Every question needs an answer.
 */
export async function submitQuestionStep(
  userId: string,
  learningBlockId: string,
  answers: Array<{ questionId: string; text?: string; selected?: number }>,
): Promise<{ done: true }> {
  const { block, questions } = await questionBlockOf(learningBlockId)
  const courseId = await assertUnitAccess(userId, block.unitId)
  await assertReachable(userId, courseId, [learningBlockId])

  const given = new Map(answers.map((a) => [a.questionId, a]))
  const toSave: Array<[string, { openEndedAnswer?: string; selectedAnswer?: number }]> = []
  for (const q of questions) {
    const a = given.get(q.id)
    if (q.format === 'short-text') {
      const text = typeof a?.text === 'string' ? a.text.trim() : ''
      if (!text) throw new AppError('Every question needs an answer', 400, 'STEP_INCOMPLETE')
      if (text.length > MAX_ANSWER_CHARS) throw new AppError('An answer is too long', 400, 'ANSWER_TOO_LONG')
      toSave.push([q.id, { openEndedAnswer: text }])
    } else {
      const n = a?.selected
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= optionsOf(q).length) {
        throw new AppError('Every question needs an answer', 400, 'STEP_INCOMPLETE')
      }
      toSave.push([q.id, { selectedAnswer: n }])
    }
  }
  for (const [questionId, data] of toSave) {
    await assertQuestionAvailable(userId, questionId)
    await saveQuestionAnswer(userId, questionId, data)
  }
  await assertBlockCompletable(userId, learningBlockId)
  await updateBlockProgress(userId, learningBlockId, 'completed')
  return { done: true }
}
