import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { db } from '../db'
import { courses, modules, units, learningBlocks, assessments, assessmentQuestions } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * "Write with AI" (POST /api/admin/quiz/generate, ported from SMEEP 642cc49):
 * admins only, checked input, a clear message when a course has too little
 * text, and the server-to-server call to potential-ai's quiz writer, here
 * answered by a local stand-in so the token, the request and the clean-up of
 * what comes back can be checked. Nothing is saved until the admin adds drafts.
 */

let admin: TestUser
let learner: TestUser
const courseIds: string[] = []
let emptyAssessmentId = ''
let fullAssessmentId = ''

let stub: Server
let stubUrl = ''
let lastRequest: { auth: string; body: Record<string, unknown> } | null = null
let reply: (body: Record<string, unknown>) => { status: number; json: unknown } = () => ({ status: 500, json: {} })

const saved = {
  url: process.env['NEXT_PUBLIC_AI_BACKEND_URL'],
  secret: process.env['COPILOT_SERVICE_JWT_SECRET'],
}
const SECRET = saved.secret ?? 'test-only-service-secret-0123456789abcdef'

const gen = (body: object, token = admin.token) =>
  api<{ success: boolean; data?: { questions: Record<string, unknown>[] }; error?: { code?: string; message?: string } }>(
    'POST',
    '/api/admin/quiz/generate',
    { token, body },
  )

async function courseWithFinalExam(title: string, lessonText: string | null): Promise<string> {
  const [course] = await db.insert(courses).values({ title, description: 'How to price and sell handmade goods.' }).returning()
  courseIds.push(course!.id)
  if (lessonText) {
    const [mod] = await db.insert(modules).values({ courseId: course!.id, title: 'Pricing' }).returning()
    const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: 'Costs and margins' }).returning()
    await db.insert(learningBlocks).values([
      { unitId: unit!.id, type: 'text', title: 'Know your costs', body: lessonText },
      { unitId: unit!.id, type: 'video', title: 'Margins explained', transcript: 'A margin is the share of the price you keep after costs.' },
    ])
  }
  const [a] = await db.insert(assessments).values({ courseId: course!.id, title: 'Final exam', assessmentType: 'post' }).returning()
  await db.insert(assessmentQuestions).values({ assessmentId: a!.id, questionType: 'true-false', questionText: 'Already asked?', options: ['True', 'False'] })
  return a!.id
}

beforeAll(async () => {
  await startTestServer()
  admin = await createTestUser('quiz-admin', 'admin')
  learner = await createTestUser('quiz-learner')
  emptyAssessmentId = await courseWithFinalExam('E2E quiz course (empty)', null)
  fullAssessmentId = await courseWithFinalExam(
    'E2E quiz course',
    `<h2>Know your costs</h2><p>${'Count every cost: materials, packaging, delivery and your own time. '.repeat(12)}</p><ul><li><strong>Price</strong> covers costs plus margin.</li></ul>`,
  )

  stub = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>
      lastRequest = { auth: String(req.headers['authorization'] ?? ''), body }
      const out = req.url === '/api/learning/quiz-generate' ? reply(body) : { status: 404, json: {} }
      res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.json))
    })
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  const addr = stub.address()
  stubUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = `${stubUrl}/`
  process.env['COPILOT_SERVICE_JWT_SECRET'] = SECRET
})

afterAll(async () => {
  if (saved.url === undefined) delete process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  else process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = saved.url
  if (saved.secret === undefined) delete process.env['COPILOT_SERVICE_JWT_SECRET']
  else process.env['COPILOT_SERVICE_JWT_SECRET'] = saved.secret
  await new Promise<void>((resolve) => stub.close(() => resolve()))
  for (const id of courseIds) await db.delete(courses).where(eq(courses.id, id))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('AI quiz drafts', () => {
  it('is admins only', async () => {
    expect((await api('POST', '/api/admin/quiz/generate', { body: { assessmentId: fullAssessmentId } })).status).toBe(401)
    expect((await gen({ assessmentId: fullAssessmentId, count: 5 }, learner.token)).status).toBe(403)
  })

  it('needs an assessment and a sensible count and type', async () => {
    expect((await gen({ count: 5 })).status).toBe(422)
    expect((await gen({ assessmentId: fullAssessmentId, count: 50 })).status).toBe(422)
    expect((await gen({ assessmentId: fullAssessmentId, format: 'essay' })).status).toBe(422)
  })

  it('404s for an unknown assessment', async () => {
    expect((await gen({ assessmentId: crypto.randomUUID() })).status).toBe(404)
  })

  it('says when the course has too little text to write from, without calling the AI', async () => {
    lastRequest = null
    const res = await gen({ assessmentId: emptyAssessmentId, count: 5 })
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('NOT_ENOUGH_CONTENT')
    expect(res.body.error?.message).toContain('Add text or video transcripts')
    expect(lastRequest).toBeNull()
  })

  it('asks potential-ai with a server token and returns only well-formed drafts, saving nothing', async () => {
    reply = () => ({
      status: 200,
      json: {
        success: true,
        data: {
          questions: [
            { format: 'multiple-choice', question: 'What does a price cover?', options: ['Costs only', 'Costs plus margin', 'Delivery', 'Tax'], correctIndex: 1, explanation: 'Price covers costs plus margin.' },
            { format: 'true-false', question: 'Your own time is a cost.', options: ['True', 'False'], correctIndex: 0, explanation: '' },
            // Dropped: the marked answer is not one of the options.
            { format: 'multiple-choice', question: 'Broken', options: ['A', 'B'], correctIndex: 5, explanation: '' },
            // Dropped: no question text.
            { format: 'true-false', question: '  ', options: ['True', 'False'], correctIndex: 1 },
          ],
        },
      },
    })
    const res = await gen({ assessmentId: fullAssessmentId, count: 5, format: 'mixed' })
    expect(res.status).toBe(200)
    expect(res.body.data?.questions).toHaveLength(2)
    expect(res.body.data?.questions[0]).toEqual({
      format: 'multiple-choice',
      question: 'What does a price cover?',
      options: ['Costs only', 'Costs plus margin', 'Delivery', 'Tax'],
      correctIndex: 1,
      explanation: 'Price covers costs plus margin.',
    })

    // The token: Hadafi, the acting admin, server scope, short-lived.
    expect(lastRequest!.auth.startsWith('Bearer ')).toBe(true)
    const claims = jwt.verify(lastRequest!.auth.slice(7), SECRET) as Record<string, unknown>
    expect(claims['platformId']).toBe('hadafi')
    expect(claims['userId']).toBe(admin.id)
    expect(claims['scope']).toBe('server')
    expect(Number(claims['exp']) - Number(claims['iat'])).toBeLessThanOrEqual(300)

    // The request: the course's own text (HTML turned to text, transcripts included) and what to avoid.
    const body = lastRequest!.body
    expect(body['title']).toBe('E2E quiz course')
    expect(body['purpose']).toBe('post')
    expect(body['count']).toBe(5)
    expect(body['format']).toBe('mixed')
    expect(body['avoid']).toEqual(['Already asked?'])
    const content = String(body['content'])
    expect(content).toContain('## Know your costs')
    expect(content).toContain('- **Price** covers costs plus margin.')
    expect(content).toContain('A margin is the share of the price you keep after costs.')
    expect(content).not.toContain('<p>')

    // Drafts only: the exam still has just its one question.
    const qs = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, fullAssessmentId))
    expect(qs).toHaveLength(1)
  })

  it('keeps to the type asked for', async () => {
    reply = () => ({
      status: 200,
      json: {
        success: true,
        data: {
          questions: [
            { format: 'multiple-choice', question: 'Pick one', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: '' },
            { format: 'true-false', question: 'Yes or no?', options: ['True', 'False'], correctIndex: 1, explanation: '' },
          ],
        },
      },
    })
    const res = await gen({ assessmentId: fullAssessmentId, count: 5, format: 'true-false' })
    expect(res.status).toBe(200)
    expect(res.body.data?.questions.map((q) => q['format'])).toEqual(['true-false'])
  })

  it('gives a plain message when potential-ai fails or writes nothing usable', async () => {
    reply = () => ({ status: 500, json: { success: false } })
    const failed = await gen({ assessmentId: fullAssessmentId })
    expect(failed.status).toBe(502)
    expect(failed.body.error?.code).toBe('AI_REQUEST_FAILED')
    expect(failed.body.error?.message).toContain('Try again in a minute')

    reply = () => ({ status: 200, json: { success: true, data: { questions: [{ format: 'essay', question: 'Discuss' }] } } })
    const empty = await gen({ assessmentId: fullAssessmentId })
    expect(empty.status).toBe(422)
    expect(empty.body.error?.code).toBe('NO_QUESTIONS')
  })
})
