import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { aiReports, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { surfaceLabel } from '../services/aiReports.service'

/**
 * AI safety review: a learner reports an answer from her own chat; admins
 * hear about it, read the conversation excerpt, add notes and set a status.
 * Learners only, the reporter is always the session's user, and it's rate limited.
 */

let learner: TestUser
let other: TestUser
let mentor: TestUser
let admin: TestUser
let reportId = ''
const MARK = `E2E report ${Date.now()}`

type Report = {
  id: string; reasonLabel: string; surfaceLabel: string; area: string; reporterEmail: string; reply: string; question: string | null
  excerpt: { role: string; text: string }[]; status: string; reviewerName: string | null; notes: { text: string; by: string | null }[]
}
type List = { data: { counts: Record<string, number>; last30Days: number; reports: Report[] } }

const report = (body: object, token = learner.token) => api<{ data: { id: string; duplicate: boolean } }>('POST', '/api/ai-reports', { token, body })
const list = (q = 'status=all') => api<List>('GET', `/api/admin/ai-reports?${q}`, { token: admin.token })
const base = {
  surface: 'mentor:marketing-coach',
  reason: 'wrong',
  reply: `${MARK}: buy 1,000 followers to look established.`,
  question: 'How do I get Instagram followers quickly?',
  excerpt: [
    { role: 'learner', text: 'I sell cakes from home.' },
    { role: 'ai', text: 'Lovely, tell me more.' },
    { role: 'learner', text: 'How do I get Instagram followers quickly?' },
  ],
  conversation: 'session-123-abc',
  page: '/dashboard/ai-mentors/marketing-coach',
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('rep')
  other = await createTestUser('rep-other')
  mentor = await createTestUser('rep-mentor', 'mentor')
  admin = await createTestUser('rep-admin', 'admin')
})

afterAll(async () => {
  await db.delete(aiReports).where(like(aiReports.reply, `${MARK}%`))
  await db.delete(notifications).where(and(eq(notifications.type, 'ai_report'), like(notifications.body, '%AI safety review%'), eq(notifications.userId, admin.id)))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('reporting', () => {
  it('lets a learner report an answer from her chat, and tells the admins', async () => {
    const res = await report({ ...base, note: 'Buying followers breaks the rules.' })
    expect(res.status).toBe(201)
    reportId = res.body.data.id
    const bell = await db.select().from(notifications).where(and(eq(notifications.userId, admin.id), eq(notifications.type, 'ai_report')))
    expect(bell.length).toBeGreaterThanOrEqual(1)
    expect(bell[0]!.link).toBe('/admin/ai-safety')
  })

  it('stores the conversation excerpt and scopes the chat to the reporter, whatever the body says', async () => {
    const [row] = await db.select().from(aiReports).where(eq(aiReports.id, reportId))
    expect(row!.userId).toBe(learner.id)
    expect(row!.conversationRef).toBe(`hadafi-${learner.id}-session-123-abc`)
    expect(row!.excerpt).toHaveLength(3)
    // A body can't claim to be someone else.
    const spoof = await report({ ...base, reply: `${MARK}: spoof`, userId: other.id, conversation: 'x' })
    const [s] = await db.select().from(aiReports).where(eq(aiReports.id, spoof.body.data.id))
    expect(s!.userId).toBe(learner.id)
    expect(s!.conversationRef).toBe(`hadafi-${learner.id}-x`)
  })

  it('reporting the same answer twice keeps one report', async () => {
    const again = await report(base)
    expect(again.status).toBe(200)
    expect(again.body.data).toMatchObject({ id: reportId, duplicate: true })
  })

  it('checks what it is sent', async () => {
    expect((await report({ ...base, reason: 'boring' })).status).toBe(422)
    expect((await report({ ...base, surface: '<script>' })).status).toBe(422)
    expect((await report({ ...base, reply: '   ' })).status).toBe(422)
    expect((await report({ ...base, conversation: '../../etc' })).status).toBe(422)
    expect((await report({ ...base, page: 'https://evil.example' })).status).toBe(422)
    expect((await api('POST', '/api/ai-reports', { body: base })).status).toBe(401)
  })

  it('is for learners only', async () => {
    expect((await report({ ...base, reply: `${MARK}: mentor` }, mentor.token)).status).toBe(403)
    expect((await report({ ...base, reply: `${MARK}: admin` }, admin.token)).status).toBe(403)
  })

  it('is rate limited per learner', async () => {
    const busy = await createTestUser('rep-busy')
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await report({ ...base, reply: `${MARK}: busy ${i}` }, busy.token)).status)
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
    // Another learner isn't affected.
    expect((await report({ ...base, reply: `${MARK}: other` }, other.token)).status).toBe(201)
  })

  it('names the AI in plain words', () => {
    expect(surfaceLabel('ask-hana')).toBe('Ask Hana')
    expect(surfaceLabel('mentor:legal-consultant')).toBe('AI mentor (legal consultant)')
  })
})

describe('reviewing', () => {
  it('is admin only', async () => {
    expect((await api('GET', '/api/admin/ai-reports', { token: learner.token })).status).toBe(403)
    expect((await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: learner.token, body: { status: 'reviewed' } })).status).toBe(403)
    expect((await api('POST', `/api/admin/ai-reports/${reportId}/notes`, { token: mentor.token, body: { text: 'x' } })).status).toBe(403)
  })

  it('lists new reports with who sent them and the excerpt, filtered by area', async () => {
    const res = await list('status=new&area=mentor')
    const r = res.body.data.reports.find((x) => x.id === reportId)!
    expect(r).toMatchObject({ reasonLabel: 'Wrong or misleading', surfaceLabel: 'AI mentor (marketing coach)', area: 'mentor', reporterEmail: learner.email, question: base.question })
    expect(r.excerpt.map((t) => t.role)).toEqual(['learner', 'ai', 'learner'])
    expect(res.body.data.counts.new).toBeGreaterThanOrEqual(1)
    const hana = await list('status=all&area=hana')
    expect(hana.body.data.reports.some((x) => x.id === reportId)).toBe(false)
  })

  it('adds notes, marks it reviewed or action taken, and can reopen it', async () => {
    expect((await api('POST', `/api/admin/ai-reports/${reportId}/notes`, { token: admin.token, body: { text: 'Updated the coach instructions.' } })).status).toBe(201)
    expect((await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: admin.token, body: { status: 'action_taken' } })).status).toBe(200)
    const done = (await list('status=action_taken')).body.data.reports.find((x) => x.id === reportId)!
    expect(done).toMatchObject({ status: 'action_taken', reviewerName: 'Test rep-admin' })
    expect(done.notes).toEqual([expect.objectContaining({ text: 'Updated the coach instructions.', by: 'Test rep-admin' })])

    await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: admin.token, body: { status: 'new' } })
    const reopened = (await list('status=new')).body.data.reports.find((x) => x.id === reportId)!
    expect(reopened.reviewerName).toBeNull()

    expect((await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: admin.token, body: { status: 'dismissed' } })).status).toBe(422)
    expect((await api('PATCH', `/api/admin/ai-reports/${crypto.randomUUID()}`, { token: admin.token, body: { status: 'reviewed' } })).status).toBe(404)
    expect((await api('POST', `/api/admin/ai-reports/not-an-id/notes`, { token: admin.token, body: { text: 'x' } })).status).toBe(404)
  })
})
