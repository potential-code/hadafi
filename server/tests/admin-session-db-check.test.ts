import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users, authSessions } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers } from './helpers'

/**
 * Admin sessions are confirmed with the database on every request, as
 * partner sessions are: the 5-minute session cookie cache must not keep a
 * signed-out or revoked admin session working.
 */

beforeAll(async () => {
  await startTestServer()
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

const revoke = (userId: string) => db.delete(authSessions).where(eq(authSessions.userId, userId))

describe('a revoked session', () => {
  it('ends an admin at once, even while its cookie cache is fresh', async () => {
    const admin = await createTestUser('dbcheck-admin', 'admin')
    expect((await api('GET', '/api/admin/needs-attention', { token: admin.token })).status).toBe(200)
    await revoke(admin.id)
    expect((await api('GET', '/api/admin/needs-attention', { token: admin.token })).status).toBe(401)
    expect((await api('GET', '/api/account/me', { token: admin.token })).status).toBe(401)
  })

  it('ends a session whose cookie still says learner but whose account is now admin', async () => {
    // Signed in as a learner (the cached role), then made an admin.
    const person = await createTestUser('dbcheck-promoted')
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, person.id))
    expect((await api('GET', '/api/admin/needs-attention', { token: person.token })).status).toBe(200)
    await revoke(person.id)
    expect((await api('GET', '/api/admin/needs-attention', { token: person.token })).status).toBe(401)
  })

  it('(a learner session still rides the 5-minute cache, which shows the cache is in play here)', async () => {
    const learner = await createTestUser('dbcheck-learner')
    expect((await api('GET', '/api/account/me', { token: learner.token })).status).toBe(200)
    await revoke(learner.id)
    expect((await api('GET', '/api/account/me', { token: learner.token })).status).toBe(200)
  })
})
