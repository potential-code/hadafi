import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { inArray } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, learningBlocks, blockQuestions, courseEnrollments } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * A course's action plan (its action-plan questions and the learner's
 * answers, as JSON or PDF) belongs to the learners of that course while it is
 * published, like its tests. It used to need only a sign-in, so any learner
 * could read any course's action-plan questions, drafts included.
 */

let learner: TestUser
let outsider: TestUser
const ids = { course: '', draft: '' }

async function courseWithPlan(title: string, status: 'published' | 'draft'): Promise<string> {
  const [c] = await db.insert(courses).values({ title, status }).returning()
  const [m] = await db.insert(modules).values({ courseId: c!.id, title: 'Module' }).returning()
  const [u] = await db.insert(units).values({ moduleId: m!.id, title: 'Unit' }).returning()
  const [b] = await db.insert(learningBlocks).values({ unitId: u!.id, type: 'question', title: 'Plan' }).returning()
  await db.insert(blockQuestions).values({ blockId: b!.id, kind: 'action-plan', format: 'short-text', prompt: `${title}: first step?`, order: 0 })
  return c!.id
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('plan-access')
  outsider = await createTestUser('plan-access-outsider')
  ids.course = await courseWithPlan('E2E plan course', 'published')
  ids.draft = await courseWithPlan('E2E plan draft', 'draft')
  await db.insert(courseEnrollments).values([
    { userId: learner.id, courseId: ids.course },
    { userId: learner.id, courseId: ids.draft },
  ])
})

afterAll(async () => {
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.draft]))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const both = (token: string, courseId: string) => Promise.all([
  api<{ data?: { questions: Array<{ question: { prompt: string } }> } }>('GET', `/api/lms/courses/${courseId}/action-plan`, { token }),
  api('GET', `/api/lms/courses/${courseId}/action-plan/pdf`, { token }),
])

describe("a course's action plan", () => {
  it('is open to an enrolled learner of a published course', async () => {
    const [json, pdf] = await both(learner.token, ids.course)
    expect(json.status).toBe(200)
    expect(json.body.data?.questions.map((q) => q.question.prompt)).toEqual(['E2E plan course: first step?'])
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toContain('application/pdf')
  })

  it('is hidden from a learner who is not enrolled', async () => {
    const res = await both(outsider.token, ids.course)
    expect(res.map((r) => r.status)).toEqual([404, 404])
    expect(JSON.stringify(res[0].body)).not.toContain('first step')
  })

  it('is hidden in an unpublished course, even from its own learners', async () => {
    const res = await both(learner.token, ids.draft)
    expect(res.map((r) => r.status)).toEqual([404, 404])
  })

  it('a course that does not exist, or a malformed id, answers 404 too', async () => {
    expect((await both(learner.token, crypto.randomUUID())).map((r) => r.status)).toEqual([404, 404])
    expect((await both(learner.token, 'not-a-uuid')).map((r) => r.status)).toEqual([404, 404])
  })
})
