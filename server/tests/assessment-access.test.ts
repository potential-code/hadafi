import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { courses, assessments, assessmentQuestions, courseEnrollments, courseCertificates } from '../db/schema'
import { UPLOADS_ROOT } from '../middleware/upload'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * A course's tests belong to the learners of that course (SMEEP fffc128, 10 Nov
 * 2026). Reading a test's questions or summary used to need only a sign-in, so
 * any learner could read any test, drafts included. Now questions, summary and
 * submit all need enrolment in a published course, and answer 404 otherwise.
 *
 * Also: certificate images are written under the one uploads folder the server
 * serves (SMEEP 1507451). Run unbundled, the certificate service used to write
 * them into server/services/uploads instead.
 *
 * Builds its own small courses and removes them afterwards.
 */

let learner: TestUser
let outsider: TestUser
const ids = { course: '', draft: '', exam: '', q: '', draftExam: '' }

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('test-access')
  outsider = await createTestUser('test-access-outsider')

  const [course] = await db.insert(courses).values({ title: 'E2E test access course', status: 'published' }).returning()
  const [draft] = await db.insert(courses).values({ title: 'E2E test access draft', status: 'draft' }).returning()
  ids.course = course!.id
  ids.draft = draft!.id
  const [exam, draftExam] = await db.insert(assessments).values([
    { courseId: ids.course, title: 'Final exam', assessmentType: 'post', isGraded: true, passingScore: 80 },
    { courseId: ids.draft, title: 'Draft exam', assessmentType: 'post', isGraded: true, passingScore: 80 },
  ]).returning()
  ids.exam = exam!.id
  ids.draftExam = draftExam!.id
  const [q] = await db.insert(assessmentQuestions).values([
    { assessmentId: ids.exam, questionText: 'Two?', options: ['one', 'two'], correctAnswer: 1 },
    { assessmentId: ids.draftExam, questionText: 'Draft two?', options: ['one', 'two'], correctAnswer: 1 },
  ]).returning()
  ids.q = q!.id
  // The learner is enrolled in both; the outsider in neither.
  await db.insert(courseEnrollments).values([
    { userId: learner.id, courseId: ids.course },
    { userId: learner.id, courseId: ids.draft },
  ])
})

afterAll(async () => {
  const certs = await db.select({ filePath: courseCertificates.filePath }).from(courseCertificates)
    .where(inArray(courseCertificates.courseId, [ids.course, ids.draft]))
  await db.delete(courseCertificates).where(inArray(courseCertificates.courseId, [ids.course, ids.draft]))
  for (const c of certs) if (c.filePath) await Bun.file(c.filePath).delete().catch(() => {})
  // Assessments, questions and attempts cascade with the course.
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.draft]))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const all3 = (token: string, examId: string) => Promise.all([
  api('GET', `/api/lms/assessments/${examId}/questions`, { token }),
  api('GET', `/api/lms/assessments/${examId}/summary`, { token }),
  api('POST', `/api/lms/assessments/${examId}/attempts`, { token, body: { answers: {} } }),
])

describe("a course's tests", () => {
  it('are hidden from a learner who is not enrolled', async () => {
    const res = await all3(outsider.token, ids.exam)
    expect(res.map((r) => r.status)).toEqual([404, 404, 404])
  })

  it('are hidden in an unpublished course, even from its own learners', async () => {
    const res = await all3(learner.token, ids.draftExam)
    expect(res.map((r) => r.status)).toEqual([404, 404, 404])
    expect(JSON.stringify(res.map((r) => r.body))).not.toContain('Draft two?')
  })

  it('a test that does not exist answers 404 too', async () => {
    const res = await all3(learner.token, crypto.randomUUID())
    expect(res.map((r) => r.status)).toEqual([404, 404, 404])
  })

  it('open to an enrolled learner, still without the answers', async () => {
    const [questions, summary] = await all3(learner.token, ids.exam)
    expect(questions.status).toBe(200)
    expect(JSON.stringify(questions.body)).toContain('Two?')
    expect(JSON.stringify(questions.body)).not.toContain('correctAnswer')
    expect(summary.status).toBe(200)
  })
})

describe('certificate images', () => {
  it('are written under the uploads folder the server serves', async () => {
    const res = await api('POST', `/api/lms/assessments/${ids.exam}/attempts`, { token: learner.token, body: { answers: { [ids.q]: 1 } } })
    expect(res.status).toBe(201)
    let row: { filePath: string | null } | undefined
    for (let i = 0; i < 40 && !row?.filePath; i++) {
      ;[row] = await db.select({ filePath: courseCertificates.filePath }).from(courseCertificates)
        .where(and(eq(courseCertificates.courseId, ids.course), eq(courseCertificates.userId, learner.id)))
      if (!row?.filePath) await Bun.sleep(250)
    }
    expect(row?.filePath).toBeTruthy()
    expect(path.resolve(row!.filePath!).startsWith(path.join(UPLOADS_ROOT, 'certificates') + path.sep)).toBe(true)
    expect(existsSync(row!.filePath!)).toBe(true)
  })
})
