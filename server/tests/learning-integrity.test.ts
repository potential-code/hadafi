import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  courses, modules, units, learningBlocks, blockQuestions, assessments, assessmentQuestions,
  courseEnrollments, users, courseCertificates,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * The learner's browser is never trusted with learning records. These cover
 * the audit of 4 Nov 2026: answer keys sent to the browser, progress and
 * certificates granted on the browser's word, farmable points, and exam
 * attempts on courses the learner isn't in.
 *
 * Builds its own small course and removes it afterwards.
 */

const PTS = 10
let learner: TestUser
let outsider: TestUser
let admin: TestUser
const ids = {
  course: '', draftCourse: '', unitA: '', unitB: '', draftUnit: '',
  textA: '', planBlock: '', quizBlock: '', textB: '', post: '', postQ: '',
  planQs: [] as string[], quizQ: '',
}

async function points(userId: string): Promise<number> {
  const [u] = await db.select({ points: users.points }).from(users).where(eq(users.id, userId))
  return u!.points
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('integrity')
  outsider = await createTestUser('integrity-outsider')
  admin = await createTestUser('integrity-admin', 'admin')

  const [course] = await db.insert(courses).values({ title: 'E2E integrity course', status: 'published', pointsPerUnit: PTS }).returning()
  const [draft] = await db.insert(courses).values({ title: 'E2E draft course', status: 'draft' }).returning()
  ids.course = course!.id
  ids.draftCourse = draft!.id

  const [mod] = await db.insert(modules).values({ courseId: ids.course, title: 'Module' }).returning()
  const [dMod] = await db.insert(modules).values({ courseId: ids.draftCourse, title: 'Draft module' }).returning()
  const [uA] = await db.insert(units).values({ moduleId: mod!.id, title: 'Unit A', order: 0 }).returning()
  const [uB] = await db.insert(units).values({ moduleId: mod!.id, title: 'Unit B', order: 1 }).returning()
  const [dU] = await db.insert(units).values({ moduleId: dMod!.id, title: 'Draft unit' }).returning()
  ids.unitA = uA!.id
  ids.unitB = uB!.id
  ids.draftUnit = dU!.id

  const blocks = await db.insert(learningBlocks).values([
    { unitId: ids.unitA, type: 'text', title: 'Read', body: 'Hello', order: 0 },
    { unitId: ids.unitA, type: 'question', title: 'Plan', order: 1 },
    { unitId: ids.unitA, type: 'question', title: 'Quiz', order: 2 },
    { unitId: ids.unitB, type: 'text', title: 'Read more', body: 'Hello again', order: 0 },
  ]).returning()
  ;[ids.textA, ids.planBlock, ids.quizBlock, ids.textB] = blocks.map((b) => b.id) as [string, string, string, string]

  const qs = await db.insert(blockQuestions).values([
    { blockId: ids.planBlock, kind: 'action-plan', format: 'short-text', prompt: 'First step?', order: 0 },
    { blockId: ids.planBlock, kind: 'action-plan', format: 'short-text', prompt: 'Second step?', order: 1 },
    { blockId: ids.quizBlock, kind: 'survey', format: 'multiple-choice', prompt: 'Pick C', options: ['A', 'B', 'C'], correctIndex: 2 },
  ]).returning()
  ids.planQs = [qs[0]!.id, qs[1]!.id]
  ids.quizQ = qs[2]!.id

  const [post] = await db.insert(assessments).values({
    courseId: ids.course, title: 'Final exam', assessmentType: 'post', isGraded: true, passingScore: 80,
  }).returning()
  ids.post = post!.id
  const [pq] = await db.insert(assessmentQuestions).values({
    assessmentId: ids.post, questionText: 'Two?', options: ['one', 'two'], correctAnswer: 1, explanation: 'Because two.',
  }).returning()
  ids.postQ = pq!.id
})

afterAll(async () => {
  await db.delete(courseCertificates).where(inArray(courseCertificates.courseId, [ids.course, ids.draftCourse]))
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.draftCourse]))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('a learner who has not enrolled', () => {
  it('cannot mark progress, answer, sit the exam or get a certificate', async () => {
    const t = { token: learner.token }
    expect((await api('POST', `/api/lms/units/${ids.unitA}/progress`, { ...t, body: { status: 'completed' } })).status).toBe(404)
    expect((await api('POST', `/api/lms/learning-blocks/${ids.textA}/progress`, { ...t, body: { status: 'completed' } })).status).toBe(404)
    expect((await api('POST', `/api/lms/questions/${ids.quizQ}/answer`, { ...t, body: { answerData: { selectedAnswer: 2 } } })).status).toBe(404)
    expect((await api('POST', `/api/lms/assessments/${ids.post}/attempts`, { ...t, body: { answers: { [ids.postQ]: 1 } } })).status).toBe(404)
    const cert = await api<{ error: { code: string } }>('POST', `/api/lms/courses/${ids.course}/certificate`, t)
    expect(cert.status).toBe(404)
    expect(cert.body.error.code).toBe('NOT_ENROLLED')
    expect(await points(learner.id)).toBe(0)
  })

  it('cannot mark progress in a draft course, even when enrolled', async () => {
    await db.insert(courseEnrollments).values({ userId: learner.id, courseId: ids.draftCourse })
    const res = await api('POST', `/api/lms/units/${ids.draftUnit}/progress`, { token: learner.token, body: { status: 'completed' } })
    expect(res.status).toBe(404)
  })
})

describe('an enrolled learner', () => {
  beforeAll(async () => {
    const res = await api('POST', `/api/lms/courses/${ids.course}/enroll`, { token: learner.token })
    expect(res.status).toBe(201)
  })

  it('gets the course without any answer keys', async () => {
    const res = await api<{ data: unknown }>('GET', `/api/lms/courses/${ids.course}`, { token: learner.token })
    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body.data)
    expect(text).toContain('Pick C')
    expect(text).toContain('Two?')
    expect(text).not.toContain('"correctIndex":2')
    expect(text).not.toContain('"correctAnswer"')
    expect(text).not.toContain('Because two.')
  })

  it('cannot claim a unit whose parts are not done', async () => {
    const res = await api<{ error: { code: string } }>('POST', `/api/lms/units/${ids.unitA}/progress`, { token: learner.token, body: { status: 'completed' } })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('UNIT_NOT_DONE')
  })

  it('cannot complete a question block until every prompt is answered', async () => {
    const t = { token: learner.token }
    const block = () => api<{ error: { code: string } }>('POST', `/api/lms/learning-blocks/${ids.planBlock}/progress`, { ...t, body: { status: 'completed' } })
    expect((await block()).status).toBe(409)
    await api('POST', `/api/lms/questions/${ids.planQs[0]}/answer`, { ...t, body: { answerData: { openEndedAnswer: 'Call ten customers' } } })
    const half = await block()
    expect(half.status).toBe(409)
    expect(half.body.error.code).toBe('BLOCK_NOT_ANSWERED')
    await api('POST', `/api/lms/questions/${ids.planQs[1]}/answer`, { ...t, body: { answerData: { openEndedAnswer: 'Write the offer' } } })
    expect((await block()).status).toBe(200)
  })

  it('cannot save an oversized written answer', async () => {
    const res = await api('POST', `/api/lms/questions/${ids.planQs[0]}/answer`, {
      token: learner.token, body: { answerData: { openEndedAnswer: 'x'.repeat(10_001) } },
    })
    expect(res.status).toBe(422)
  })

  it('gets back only their own saved answers', async () => {
    const mine = await api<{ data: Array<{ questionId: string; answerData: { openEndedAnswer?: string } }> }>(
      'GET', `/api/lms/learning-blocks/${ids.planBlock}/answers`, { token: learner.token },
    )
    expect(mine.status).toBe(200)
    expect(mine.body.data.map((a) => a.questionId).sort()).toEqual([...ids.planQs].sort())
    const theirs = await api<{ data: unknown[] }>('GET', `/api/lms/learning-blocks/${ids.planBlock}/answers`, { token: outsider.token })
    expect(theirs.body.data).toEqual([])
  })

  it('earns a unit\'s points once, however often it is redone', async () => {
    const t = { token: learner.token }
    const before = await points(learner.id)
    expect((await api('POST', `/api/lms/learning-blocks/${ids.textB}/progress`, { ...t, body: { status: 'completed' } })).status).toBe(200)
    expect(await points(learner.id)).toBe(before + PTS)
    for (let i = 0; i < 3; i++) {
      await api('POST', `/api/lms/units/${ids.unitB}/progress`, { ...t, body: { status: 'not_started' } })
      await api('POST', `/api/lms/learning-blocks/${ids.textB}/progress`, { ...t, body: { status: 'not_started' } })
      await api('POST', `/api/lms/learning-blocks/${ids.textB}/progress`, { ...t, body: { status: 'completed' } })
      await api('POST', `/api/lms/units/${ids.unitB}/progress`, { ...t, body: { status: 'completed' } })
    }
    expect(await points(learner.id)).toBe(before + PTS)
  })

  it('cannot get a certificate before finishing the course', async () => {
    const res = await api<{ error: { code: string } }>('POST', `/api/lms/courses/${ids.course}/certificate`, { token: learner.token })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('PROGRESS_INCOMPLETE')
  })

  it('earns the certificate by finishing everything and passing the exam', async () => {
    const t = { token: learner.token }
    expect((await api('POST', `/api/lms/learning-blocks/${ids.textA}/progress`, { ...t, body: { status: 'completed' } })).status).toBe(200)
    await api('POST', `/api/lms/questions/${ids.quizQ}/answer`, { ...t, body: { answerData: { selectedAnswer: 2 } } })
    expect((await api('POST', `/api/lms/learning-blocks/${ids.quizBlock}/progress`, { ...t, body: { status: 'completed' } })).status).toBe(200)

    const failed = await api<{ data: { hasPassed: boolean } }>('POST', `/api/lms/assessments/${ids.post}/attempts`, { ...t, body: { answers: { [ids.postQ]: 0 } } })
    expect(failed.status).toBe(201)
    expect(failed.body.data.hasPassed).toBe(false)
    const passed = await api<{ data: { hasPassed: boolean } }>('POST', `/api/lms/assessments/${ids.post}/attempts`, { ...t, body: { answers: { [ids.postQ]: 1 } } })
    expect(passed.body.data.hasPassed).toBe(true)
    // A passed exam is done.
    expect((await api('POST', `/api/lms/assessments/${ids.post}/attempts`, { ...t, body: { answers: { [ids.postQ]: 1 } } })).status).toBe(409)

    // Reaching 100% issues the certificate on its own; asking again doesn't make a second.
    const cert = await api<{ data: { id: string } }>('GET', `/api/lms/courses/${ids.course}/certificate`, t)
    expect(cert.status).toBe(200)
    const again = await api<{ data: { id: string } }>('POST', `/api/lms/courses/${ids.course}/certificate`, t)
    expect(again.status).toBe(200)
    expect(again.body.data.id).toBe(cert.body.data.id)
    const rows = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, learner.id))
    expect(rows.length).toBe(1)

    // Its image is for the learner and admins only.
    const own = await api('GET', `/api/lms/certificates/${cert.body.data.id}/download`, t)
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toBe('image/png')
    expect((await api('GET', `/api/lms/certificates/${cert.body.data.id}/download`, { token: outsider.token })).status).toBe(404)
    expect((await api('GET', `/api/lms/certificates/${cert.body.data.id}/download`, { token: admin.token })).status).toBe(200)
  })
})

describe('mentor contact details', () => {
  it('are not in the learner mentor list', async () => {
    const res = await api<Array<Record<string, unknown>>>('GET', '/api/mentors', { token: learner.token })
    expect(res.status).toBe(200)
    for (const m of res.body) {
      expect(m).not.toHaveProperty('email')
      expect(m).not.toHaveProperty('meetingLink')
    }
  })
})

describe('the PDF email tool', () => {
  it('turns down an oversized document', async () => {
    const res = await api('POST', '/api/ai-tools/generate-pdf', {
      token: outsider.token,
      body: { documentType: 'business-plan', content: 'x'.repeat(60_001), emailAddress: 'someone@e2e.local' },
    })
    expect(res.status).toBe(400)
  })

  it('is capped per learner', async () => {
    const user = await createTestUser('pdf-cap')
    const send = () => api('POST', '/api/ai-tools/generate-pdf', {
      token: user.token,
      // An unknown document type is refused before anything is emailed, but still counts.
      body: { documentType: 'not-a-type', content: 'x', emailAddress: 'someone@e2e.local' },
    })
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(400)
    expect((await send()).status).toBe(429)
  })
})

// Per-email sign-in limits (codes and passwords) are covered in auth.test.ts.
