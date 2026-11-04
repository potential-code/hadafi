import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { inArray } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, learningBlocks, blockQuestions, assessments, assessmentQuestions } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * A learner who opens a course they haven't joined sees what it covers and a
 * way to start it, not "Course not found". The outline carries titles and
 * counts only: never lesson bodies, video links, questions or answer keys.
 *
 * Builds its own small course and removes it afterwards.
 */

type Preview = {
  units: { title: string; description: string | null; lessons: number; videos: number; readings: number; activities: number }[]
  totals: { units: number; lessons: number; videos: number; readings: number; activities: number }
  hasPreTest: boolean
  hasFinalExam: boolean
  learners: number
}
type CourseDetail = {
  id: string
  title: string
  isEnrolled: boolean
  progressPercentage: number
  modules: unknown[]
  preview?: Preview
}

let learner: TestUser
const ids = { course: '', draft: '' }
const SECRET_BODY = 'E2E secret lesson body'
const SECRET_VIDEO = 'https://example.test/e2e-secret-video.mp4'
const SECRET_PROMPT = 'E2E secret question prompt'
const SECRET_EXPLANATION = 'E2E secret explanation'

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('coursepreview')

  const [course] = await db.insert(courses).values({ title: 'E2E preview course', status: 'published', description: 'What it is about' }).returning()
  const [draft] = await db.insert(courses).values({ title: 'E2E preview draft', status: 'draft' }).returning()
  ids.course = course!.id
  ids.draft = draft!.id

  const [mod] = await db.insert(modules).values({ courseId: ids.course, title: 'Module' }).returning()
  const [u1] = await db.insert(units).values({ moduleId: mod!.id, title: 'Know your numbers', description: 'Income and costs', order: 0 }).returning()
  const [u2] = await db.insert(units).values({ moduleId: mod!.id, title: 'Plan the year', order: 1 }).returning()
  const blocks = await db.insert(learningBlocks).values([
    { unitId: u1!.id, type: 'video', title: 'Video', videoUrl: SECRET_VIDEO, transcript: SECRET_BODY, order: 0 },
    { unitId: u1!.id, type: 'text', title: 'Read', body: SECRET_BODY, order: 1 },
    { unitId: u1!.id, type: 'question', title: 'Check', order: 2 },
    { unitId: u2!.id, type: 'image', title: 'Chart', imageUrl: '/uploads/e2e.png', order: 0 },
  ]).returning()
  await db.insert(blockQuestions).values({
    blockId: blocks[2]!.id, kind: 'survey', format: 'multiple-choice', prompt: SECRET_PROMPT, options: ['A', 'B'], correctIndex: 1,
  })
  const [post] = await db.insert(assessments).values({ courseId: ids.course, title: 'Final exam', assessmentType: 'post', isGraded: true, passingScore: 80 }).returning()
  await db.insert(assessmentQuestions).values({
    assessmentId: post!.id, questionText: SECRET_PROMPT, options: ['one', 'two'], correctAnswer: 1, explanation: SECRET_EXPLANATION,
  })
})

afterAll(async () => {
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.draft]))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('a course the learner has not joined', () => {
  it('shows the course and its outline instead of an error', async () => {
    const res = await api<{ data: CourseDetail }>('GET', `/api/lms/courses/${ids.course}`, { token: learner.token })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.isEnrolled).toBe(false)
    expect(d.title).toBe('E2E preview course')
    expect(d.modules).toEqual([])
    expect(d.progressPercentage).toBe(0)
    expect(d.preview).toEqual({
      units: [
        { title: 'Know your numbers', description: 'Income and costs', lessons: 3, videos: 1, readings: 1, activities: 1 },
        { title: 'Plan the year', description: null, lessons: 1, videos: 0, readings: 1, activities: 0 },
      ],
      totals: { units: 2, lessons: 4, videos: 1, readings: 2, activities: 1 },
      hasPreTest: false,
      hasFinalExam: true,
      learners: 0,
    })
  })

  it('never includes lesson content, questions or answer keys', async () => {
    const res = await api<{ data: CourseDetail }>('GET', `/api/lms/courses/${ids.course}`, { token: learner.token })
    const json = JSON.stringify(res.body)
    for (const secret of [SECRET_BODY, SECRET_VIDEO, SECRET_PROMPT, SECRET_EXPLANATION, '/uploads/e2e.png']) {
      expect(json).not.toContain(secret)
    }
    expect(json).not.toContain('correctAnswer')
    expect(json).not.toContain('correctIndex')
  })

  it('opens the full course after enrolling, still without answer keys', async () => {
    expect((await api('POST', `/api/lms/courses/${ids.course}/enroll`, { token: learner.token })).status).toBe(201)
    const res = await api<{ data: CourseDetail }>('GET', `/api/lms/courses/${ids.course}`, { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data.isEnrolled).toBe(true)
    expect(res.body.data.modules.length).toBe(1)
    expect(res.body.data.preview).toBeUndefined()
    const json = JSON.stringify(res.body.data)
    expect(json).not.toContain(SECRET_EXPLANATION)
    expect(json).not.toMatch(/"correctAnswer":\d/)
    expect(json).not.toMatch(/"correctIndex":\d/)
  })

  it('counts learners who started it', async () => {
    const other = await createTestUser('coursepreview-other')
    const res = await api<{ data: CourseDetail }>('GET', `/api/lms/courses/${ids.course}`, { token: other.token })
    expect(res.body.data.preview?.learners).toBe(1)
  })

  it('404s for a draft course, a missing course and a malformed id', async () => {
    const t = { token: learner.token }
    expect((await api('GET', `/api/lms/courses/${ids.draft}`, t)).status).toBe(404)
    expect((await api('GET', `/api/lms/courses/${crypto.randomUUID()}`, t)).status).toBe(404)
    expect((await api('GET', '/api/lms/courses/not-a-course', t)).status).toBe(404)
  })

  it('lists the course with its unit count', async () => {
    const res = await api<{ data: Array<{ id: string; unitCount: number }> }>('GET', '/api/lms/courses', { token: learner.token })
    expect(res.body.data.find((c) => c.id === ids.course)?.unitCount).toBe(2)
    expect(res.body.data.some((c) => c.id === ids.draft)).toBe(false)
  })

  it('needs a signed-in learner', async () => {
    expect((await api('GET', `/api/lms/courses/${ids.course}`)).status).toBe(401)
  })
})
