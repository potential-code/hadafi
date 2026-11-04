import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { and, eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { db } from '../db'
import { courses, modules, units, learningBlocks, courseEnrollments, examinerAttempts, userBadges, users } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * The AI Examiner (ported from SMEEP 7c7331f, 4744f93, 21abecf): only enrolled
 * learners on published courses; the exam is marked by potential-ai's grader
 * (here a local stand-in) from the transcript it holds, never from a score or
 * transcript the page sends; one exam is marked once; marking is rate
 * limited; the "Real-world ready" badge comes from stored attempts; and each
 * learner sees only her own attempts.
 */

let learner: TestUser
let other: TestUser
let busy: TestUser
/** Separate learners for the refused and failed requests: each counts towards the hourly limit. */
let checker: TestUser
let failer: TestUser
let courseId = ''
let draftId = ''
let notEnrolledId = ''
const courseIds: string[] = []

let stub: Server
let stubUrl = ''
let calls: Array<{ auth: string; body: Record<string, unknown> }> = []
let reply: (body: Record<string, unknown>) => { status: number; json: unknown } = () => ({ status: 500, json: {} })

const saved = {
  url: process.env['NEXT_PUBLIC_AI_BACKEND_URL'],
  secret: process.env['COPILOT_SERVICE_JWT_SECRET'],
  anam: process.env['ANAM_API_KEY'],
}
const SECRET = saved.secret ?? 'test-only-service-secret-0123456789abcdef'

const card = (overallScore: number) => ({
  scenario: 'A customer asks about a late order',
  overallScore,
  dimensions: { courseKnowledge: overallScore, application: 60, communication: 70, problemSolving: 65, professionalism: 80 },
  strengths: ['Named the delivery cost clearly'],
  improvements: ['Offer a next step'],
  feedback: 'You used the pricing unit well.',
  transcript: [
    { role: 'customer', text: 'Why is my order late?' },
    { role: 'learner', text: 'Delivery costs went up, so we changed couriers.' },
  ],
})

type Attempt = { id: string; overallScore: number; dimensions: Record<string, number>; scenario: string; feedback: string }
const mark = (token: string, body: Record<string, unknown>) =>
  api<{ success: boolean; data?: Attempt; error?: { code?: string; message?: string } }>('POST', '/api/ai/examiner/attempts', { token, body })
const uuid = () => crypto.randomUUID()

async function course(title: string, status: 'published' | 'draft', enrol: TestUser[]): Promise<string> {
  const [c] = await db.insert(courses).values({ title, status, description: 'Pricing for handmade goods.' }).returning()
  courseIds.push(c!.id)
  const [mod] = await db.insert(modules).values({ courseId: c!.id, title: 'Pricing' }).returning()
  const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: 'Costs and margins' }).returning()
  await db.insert(learningBlocks).values([
    { unitId: unit!.id, type: 'text', title: 'Know your costs', body: '<p>Count <strong>every</strong> cost: materials, packaging and delivery.</p>' },
    { unitId: unit!.id, type: 'video', title: 'Margins explained', transcript: 'A margin is the share of the price you keep.' },
  ])
  for (const u of enrol) await db.insert(courseEnrollments).values({ userId: u.id, courseId: c!.id })
  return c!.id
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('examinee')
  other = await createTestUser('examinee-other')
  busy = await createTestUser('examinee-busy')
  checker = await createTestUser('examinee-checker')
  failer = await createTestUser('examinee-failer')
  courseId = await course('E2E examiner course', 'published', [learner, other, busy, checker, failer])
  draftId = await course('E2E examiner draft', 'draft', [learner, checker])
  notEnrolledId = await course('E2E examiner not enrolled', 'published', [])

  stub = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>
      calls.push({ auth: String(req.headers['authorization'] ?? ''), body })
      const out = req.url === '/api/examiner/grade' && req.method === 'POST' ? reply(body) : { status: 404, json: {} }
      res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.json))
    })
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  const addr = stub.address()
  stubUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = `${stubUrl}/`
  process.env['COPILOT_SERVICE_JWT_SECRET'] = SECRET
  delete process.env['ANAM_API_KEY']
})

afterAll(async () => {
  if (saved.url === undefined) delete process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  else process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = saved.url
  if (saved.secret === undefined) delete process.env['COPILOT_SERVICE_JWT_SECRET']
  else process.env['COPILOT_SERVICE_JWT_SECRET'] = saved.secret
  if (saved.anam !== undefined) process.env['ANAM_API_KEY'] = saved.anam
  await new Promise<void>((resolve) => stub.close(() => resolve()))
  for (const id of courseIds) await db.delete(courses).where(eq(courses.id, id))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('AI Examiner: who can sit it', () => {
  it('needs a signed-in user', async () => {
    expect((await api('GET', '/api/ai/examiner/courses')).status).toBe(401)
    expect((await api('POST', '/api/ai/examiner/attempts', { body: { courseId, mode: 'text', threadId: uuid() } })).status).toBe(401)
  })

  it('lists only the published courses she is enrolled in', async () => {
    const res = await api<{ data: { courseId: string; progressPercentage: number }[] }>('GET', '/api/ai/examiner/courses', { token: checker.token })
    expect(res.status).toBe(200)
    const ids = res.body.data.map((c) => c.courseId)
    expect(ids).toContain(courseId)
    expect(ids).not.toContain(draftId)
    expect(ids).not.toContain(notEnrolledId)
  })

  it('gives the course reference to enrolled learners only, as text', async () => {
    const ok = await api<{ data: { title: string; reference: string } }>('GET', `/api/ai/examiner/courses/${courseId}/reference`, { token: checker.token })
    expect(ok.status).toBe(200)
    expect(ok.body.data.reference).toContain('UNIT: Costs and margins')
    expect(ok.body.data.reference).toContain('Count **every** cost')
    expect(ok.body.data.reference).toContain('A margin is the share of the price you keep.')
    expect(ok.body.data.reference).not.toContain('<p>')
    expect((await api('GET', `/api/ai/examiner/courses/${notEnrolledId}/reference`, { token: checker.token })).status).toBe(403)
    expect((await api('GET', `/api/ai/examiner/courses/${draftId}/reference`, { token: checker.token })).status).toBe(404)
    expect((await api('GET', '/api/ai/examiner/courses/not-a-uuid/reference', { token: checker.token })).status).toBe(404)
  })

  it('marks nothing for a course she is not enrolled in, or one not published, without asking the AI', async () => {
    calls = []
    reply = () => ({ status: 200, json: { success: true, data: card(95) } })
    const notEnrolled = await mark(checker.token, { courseId: notEnrolledId, mode: 'text', threadId: uuid() })
    expect(notEnrolled.status).toBe(403)
    expect(notEnrolled.body.error?.code).toBe('NOT_ENROLLED')
    expect((await mark(checker.token, { courseId: draftId, mode: 'text', threadId: uuid() })).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('checks the mode and the exam session', async () => {
    expect((await mark(checker.token, { courseId, mode: 'essay', threadId: uuid() })).status).toBe(422)
    expect((await mark(checker.token, { courseId, mode: 'text' })).status).toBe(422)
    const bad = await mark(checker.token, { courseId, mode: 'text', threadId: 'has spaces/and slashes' })
    expect(bad.status).toBe(400)
    expect(bad.body.error?.code).toBe('INVALID_ATTEMPT')
  })
})

describe('AI Examiner: marking happens on the server', () => {
  it("stores the grader's score, not the page's, and sends potential-ai no transcript or score", async () => {
    calls = []
    reply = () => ({ status: 200, json: { success: true, data: card(64) } })
    const threadId = uuid()
    const res = await mark(learner.token, {
      courseId,
      mode: 'voice',
      scenario: 'Page scenario',
      threadId,
      // A forged result: all ignored.
      overallScore: 100,
      dimensions: { courseKnowledge: 100, application: 100, communication: 100, problemSolving: 100, professionalism: 100 },
      transcript: [{ role: 'learner', text: 'A perfect answer' }],
      feedback: 'Perfect',
    })
    expect(res.status).toBe(201)
    expect(res.body.data?.overallScore).toBe(64)
    expect(res.body.data?.scenario).toBe('A customer asks about a late order')

    // One call, with a 5-minute server token for this learner on Hadafi.
    expect(calls).toHaveLength(1)
    const claims = jwt.verify(calls[0]!.auth.slice(7), SECRET) as Record<string, unknown>
    expect(claims['platformId']).toBe('hadafi')
    expect(claims['userId']).toBe(learner.id)
    expect(claims['scope']).toBe('server')
    expect(Number(claims['exp']) - Number(claims['iat'])).toBeLessThanOrEqual(300)
    const body = calls[0]!.body
    expect(Object.keys(body).sort()).toEqual(['course', 'scenario', 'threadId'])
    expect(body['threadId']).toBe(threadId)
    expect(body['scenario']).toBe('Page scenario')
    const course = body['course'] as { title: string; reference: string }
    expect(course.title).toBe('E2E examiner course')
    expect(course.reference).toContain('Know your costs')

    const [row] = await db.select().from(examinerAttempts).where(eq(examinerAttempts.id, res.body.data!.id))
    expect(row!.userId).toBe(learner.id)
    expect(row!.mode).toBe('voice')
    expect(row!.overallScore).toBe(64)
    expect(row!.feedback).toBe('You used the pricing unit well.')
    expect(row!.transcript).toEqual(card(64).transcript)
  })

  it('marks one exam once: asking again returns the stored result', async () => {
    const threadId = uuid()
    reply = () => ({ status: 200, json: { success: true, data: card(55) } })
    const first = await mark(learner.token, { courseId, mode: 'text', threadId })
    expect(first.status).toBe(201)
    calls = []
    reply = () => ({ status: 200, json: { success: true, data: card(99) } })
    const again = await mark(learner.token, { courseId, mode: 'text', threadId })
    expect(again.status).toBe(201)
    expect(again.body.data?.id).toBe(first.body.data!.id)
    expect(again.body.data?.overallScore).toBe(55)
    expect(calls).toHaveLength(0)
    const rows = await db.select().from(examinerAttempts).where(and(eq(examinerAttempts.userId, learner.id), eq(examinerAttempts.threadId, threadId)))
    expect(rows).toHaveLength(1)
  })

  it('says so when the exam has ended or nothing was answered, and stores nothing', async () => {
    const before = (await db.select().from(examinerAttempts).where(eq(examinerAttempts.userId, failer.id))).length
    reply = () => ({ status: 409, json: { success: false, error: { code: 'exam_not_found' } } })
    const gone = await mark(failer.token, { courseId, mode: 'text', threadId: uuid() })
    expect(gone.status).toBe(409)
    expect(gone.body.error?.code).toBe('EXAM_NOT_FOUND')

    reply = () => ({ status: 400, json: { success: false, error: { code: 'empty_attempt' } } })
    const empty = await mark(failer.token, { courseId, mode: 'text', threadId: uuid() })
    expect(empty.status).toBe(400)
    expect(empty.body.error?.code).toBe('EMPTY_ATTEMPT')

    // The grader's own output is checked too.
    reply = () => ({ status: 200, json: { success: true, data: { ...card(150) } } })
    expect((await mark(failer.token, { courseId, mode: 'text', threadId: uuid() })).status).toBe(503)
    reply = () => ({ status: 200, json: { success: true, data: { ...card(80), transcript: [{ role: 'customer', text: 'Hello?' }] } } })
    expect((await mark(failer.token, { courseId, mode: 'text', threadId: uuid() })).body.error?.code).toBe('EMPTY_ATTEMPT')
    reply = () => ({ status: 500, json: {} })
    const down = await mark(failer.token, { courseId, mode: 'text', threadId: uuid() })
    expect(down.status).toBe(503)
    expect(down.body.error?.message).toContain('try again')

    expect((await db.select().from(examinerAttempts).where(eq(examinerAttempts.userId, failer.id))).length).toBe(before)
  })

  it('limits marking to 10 an hour per learner', async () => {
    for (let i = 0; i < 10; i++) expect((await mark(busy.token, { courseId, mode: 'essay', threadId: uuid() })).status).toBe(422)
    const limited = await mark(busy.token, { courseId, mode: 'text', threadId: uuid() })
    expect(limited.status).toBe(429)
    expect(limited.body.error?.code).toBe('RATE_LIMITED')
    // Someone else is not affected.
    reply = () => ({ status: 200, json: { success: true, data: card(40) } })
    expect((await mark(other.token, { courseId, mode: 'text', threadId: uuid() })).status).toBe(201)
  })
})

describe('AI Examiner: results', () => {
  it('awards "Real-world ready" for 70 or more, from the stored attempt, once', async () => {
    const badges = (id: string) =>
      db.select().from(userBadges).where(and(eq(userBadges.userId, id), eq(userBadges.badge, 'examined')))
    expect(await badges(learner.id)).toHaveLength(0) // 64 and 55 so far
    reply = () => ({ status: 200, json: { success: true, data: card(72) } })
    expect((await mark(learner.token, { courseId, mode: 'video', threadId: uuid() })).status).toBe(201)
    expect(await badges(learner.id)).toHaveLength(1)
    reply = () => ({ status: 200, json: { success: true, data: card(90) } })
    expect((await mark(learner.token, { courseId, mode: 'text', threadId: uuid() })).status).toBe(201)
    expect(await badges(learner.id)).toHaveLength(1)
    // 40 earns nothing.
    expect(await badges(other.id)).toHaveLength(0)

    const ach = await api<{ data: { badges: { key: string; earnedAt: string | null }[] } }>('GET', '/api/me/achievements', { token: learner.token })
    expect(ach.body.data.badges.find((b) => b.key === 'examined')?.earnedAt).toBeTruthy()
  })

  it('awards no badge to staff accounts', async () => {
    const mentor = await createTestUser('examiner-mentor', 'mentor')
    await db.insert(courseEnrollments).values({ userId: mentor.id, courseId })
    reply = () => ({ status: 200, json: { success: true, data: card(95) } })
    expect((await mark(mentor.token, { courseId, mode: 'text', threadId: uuid() })).status).toBe(201)
    expect(await db.select().from(userBadges).where(eq(userBadges.userId, mentor.id))).toHaveLength(0)
  })

  it('shows each learner her own attempts only, newest first, without transcripts', async () => {
    type Row = { id: string; overallScore: number; courseTitle: string; transcript?: unknown; mode: string }
    const mine = await api<{ data: Row[] }>('GET', '/api/ai/examiner/attempts?limit=50', { token: learner.token })
    expect(mine.status).toBe(200)
    expect(mine.body.data.map((a) => a.overallScore)).toEqual([90, 72, 55, 64])
    expect(mine.body.data[0]!.courseTitle).toBe('E2E examiner course')
    expect(mine.body.data[0]!.transcript).toBeUndefined()
    const theirs = await api<{ data: Row[] }>('GET', '/api/ai/examiner/attempts', { token: other.token })
    expect(theirs.body.data.map((a) => a.overallScore)).toEqual([40])
    const ids = new Set(mine.body.data.map((a) => a.id))
    expect(theirs.body.data.some((a) => ids.has(a.id))).toBe(false)
  })

  it("can't mark another learner's exam: the token always names the caller", async () => {
    const [mineRow] = await db.select().from(examinerAttempts).where(eq(examinerAttempts.userId, learner.id)).limit(1)
    calls = []
    reply = () => ({ status: 409, json: { success: false, error: { code: 'exam_not_found' } } })
    const res = await mark(other.token, { courseId, mode: 'text', threadId: mineRow!.threadId })
    // Not her stored result, and potential-ai is asked for the caller's own thread.
    expect(res.status).toBe(409)
    const claims = jwt.verify(calls[0]!.auth.slice(7), SECRET) as Record<string, unknown>
    expect(claims['userId']).toBe(other.id)
  })

  it('profile: first name and company, nothing more', async () => {
    await db.update(users).set({ company: 'Layla Crafts' }).where(eq(users.id, learner.id))
    const res = await api<{ data: Record<string, unknown> }>('GET', '/api/ai/examiner/profile', { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data['firstName']).toBe('Test')
    expect(res.body.data['company']).toBe('Layla Crafts')
    expect(res.body.data['role']).toBe('Entrepreneur')
    expect(res.body.data['email']).toBeUndefined()
  })
})

describe('AI Examiner: video', () => {
  it('says plainly when video is not set up', async () => {
    const res = await api<{ error?: { code?: string } }>('POST', '/api/ai/anam/session-token', { token: learner.token })
    expect(res.status).toBe(503)
    expect(res.body.error?.code).toBe('ANAM_NOT_CONFIGURED')
    expect((await api('POST', '/api/ai/anam/session-token')).status).toBe(401)
  })
})
