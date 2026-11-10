import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { courses, assessments, assessmentQuestions, assessmentAttempts, courseEnrollments } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Pre-tests and exams count attempts by reading them and then inserting the
 * new one, so requests sent at the same moment all see the same count (the
 * pattern SMEEP fixed in its journeys on 10 Nov 2026, 9a0d5f4). The unique
 * (user, test, attempt number) index already kept the limit, but the losing
 * requests failed with a server error, so a double-click on Submit showed the
 * learner an error. Each learner's submissions to one test now take turns.
 *
 * Builds its own small course and removes it afterwards.
 */

let learner: TestUser
const ids = { course: '', exam: '', q: '' }
const PARALLEL = 8

const submit = (answer: number) =>
  api<{ data?: { attemptsMade: number }; error?: { code: string } }>('POST', `/api/lms/assessments/${ids.exam}/attempts`, {
    token: learner.token,
    body: { answers: { [ids.q]: answer } },
  })

const attempts = () =>
  db.select().from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, learner.id), eq(assessmentAttempts.assessmentId, ids.exam)))

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('attempt-race')
  const [course] = await db.insert(courses).values({ title: 'E2E attempt race course', status: 'published' }).returning()
  ids.course = course!.id
  const [exam] = await db.insert(assessments).values({
    courseId: ids.course, title: 'Final exam', assessmentType: 'post', isGraded: true, passingScore: 80, maxAttempts: 2,
  }).returning()
  ids.exam = exam!.id
  const [q] = await db.insert(assessmentQuestions).values({
    assessmentId: ids.exam, questionText: 'Two?', options: ['one', 'two'], correctAnswer: 1,
  }).returning()
  ids.q = q!.id
  await db.insert(courseEnrollments).values({ userId: learner.id, courseId: ids.course })
})

afterAll(async () => {
  // Assessments and attempts cascade with the course.
  if (ids.course) await db.delete(courses).where(eq(courses.id, ids.course))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('exam attempts sent at the same moment', () => {
  it('never go past the attempt limit', async () => {
    const results = await Promise.all(Array.from({ length: PARALLEL }, () => submit(0)))
    const rows = await attempts()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.attemptNumber).sort()).toEqual([1, 2])
    expect(results.filter((r) => r.status < 300)).toHaveLength(2)
    // The rest are told plainly that no attempts are left: never a server error.
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0)
    expect(results.filter((r) => r.status >= 300).every((r) => r.body?.error?.code === 'MAX_ATTEMPTS_EXCEEDED')).toBe(true)
  })

  it('record one pass, however many passing answers arrive together', async () => {
    await db.delete(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, learner.id), eq(assessmentAttempts.assessmentId, ids.exam)))
    await db.update(assessments).set({ maxAttempts: 0 }).where(eq(assessments.id, ids.exam))
    const results = await Promise.all(Array.from({ length: PARALLEL }, () => submit(1)))
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0)
    expect(results.filter((r) => r.status < 300)).toHaveLength(1)
    expect(results.filter((r) => r.status >= 300).every((r) => r.body?.error?.code === 'ALREADY_PASSED')).toBe(true)
    const rows = await attempts()
    expect(rows.filter((r) => r.passed === true)).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })
})

describe('the answers a submission may carry', () => {
  it('are capped, so one request cannot carry thousands of keys', async () => {
    const answers = Object.fromEntries(Array.from({ length: 501 }, () => [crypto.randomUUID(), 0]))
    const res = await api('POST', `/api/lms/assessments/${ids.exam}/attempts`, { token: learner.token, body: { answers } })
    expect(res.status).toBe(422)
  })
})
