import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * The learner course routes (/api/lms, outside /api/lms/admin) and the AI
 * mentors (/api/ai-mentors) are for learners, mentors and admins. A partner
 * login only sees its organisation's portal (/api/partner): it used to reach
 * these with any session.
 */

const BOT = '6b06d2e73460887e1896aebb'
let learner: TestUser
let mentor: TestUser
let admin: TestUser
let partner: TestUser

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('roles-learner')
  mentor = await createTestUser('roles-mentor', 'mentor')
  admin = await createTestUser('roles-admin', 'admin')
  partner = await createTestUser('roles-partner')
  // authenticate() reads the role from the users row on every request.
  await db.update(users).set({ role: 'partner' }).where(eq(users.id, partner.id))
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('learner course routes', () => {
  it('open to learners, mentors and admins', async () => {
    for (const u of [learner, mentor, admin]) {
      expect((await api('GET', '/api/lms/courses', { token: u.token })).status).toBe(200)
      expect((await api('GET', '/api/lms/certificates', { token: u.token })).status).toBe(200)
    }
  })

  it('refused to a partner login', async () => {
    const courseId = crypto.randomUUID()
    const calls = await Promise.all([
      api('GET', '/api/lms/courses', { token: partner.token }),
      api('POST', `/api/lms/courses/${courseId}/enroll`, { token: partner.token, body: {} }),
      api('GET', `/api/lms/courses/${courseId}/action-plan`, { token: partner.token }),
      api('GET', '/api/lms/certificates', { token: partner.token }),
    ])
    expect(calls.map((r) => r.status)).toEqual([403, 403, 403, 403])
  })
})

describe('AI mentors', () => {
  it('refused to a partner login (before anything is asked of the bot service)', async () => {
    expect((await api('GET', `/api/ai-mentors/${BOT}`, { token: partner.token })).status).toBe(403)
    expect((await api('POST', `/api/ai-mentors/${BOT}/chat`, { token: partner.token, body: { message: 'hi' } })).status).toBe(403)
  })

  it('still need a sign-in', async () => {
    expect((await api('GET', `/api/ai-mentors/${BOT}`)).status).toBe(401)
  })
})
