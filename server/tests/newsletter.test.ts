import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { like } from 'drizzle-orm'
import { db } from '../db'
import { newsletterSubscribers } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, fixtureEmail, ORIGIN, type TestUser } from './helpers'

/**
 * The homepage newsletter form (POST /api/newsletter/subscribe) and its admin
 * export. Public form: one row per address, the same answer whether or not the
 * address was already on the list, and the list only reaches admins.
 */
let base = ''
let admin: TestUser
let learner: TestUser
const email = fixtureEmail('newsletter')
const domain = email.split('@')[1]!

beforeAll(async () => {
  base = await startTestServer()
  admin = await createTestUser('newsletter-admin', 'admin')
  learner = await createTestUser('newsletter-learner')
})

afterAll(async () => {
  await db.delete(newsletterSubscribers).where(like(newsletterSubscribers.email, `%@${domain}`))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const subscribe = (body: unknown) => api<{ success: boolean; data?: { subscribed: boolean }; error?: { code: string } }>('POST', '/api/newsletter/subscribe', { body })

describe('Newsletter sign-up', () => {
  it('adds an address once, lower-cased, and answers the same way when it is already there', async () => {
    const first = await subscribe({ email: `  ${email.toUpperCase()} ` })
    expect(first.status).toBe(201)
    const again = await subscribe({ email })
    expect(again.status).toBe(201)
    expect(again.body).toEqual(first.body)
    const rows = await db.select().from(newsletterSubscribers).where(like(newsletterSubscribers.email, `%@${domain}`))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe(email)
    expect(rows[0]!.source).toBe('homepage')
  })

  it('refuses anything that is not a single email address', async () => {
    for (const body of [{}, { email: 'not-an-email' }, { email: `${'a'.repeat(250)}@x.io` }, { email, extra: 1 }]) {
      const res = await subscribe(body)
      expect(res.status).toBe(422)
    }
  })

  it('re-activates an address that unsubscribed', async () => {
    await db.update(newsletterSubscribers).set({ unsubscribedAt: new Date() }).where(like(newsletterSubscribers.email, email))
    expect((await subscribe({ email })).status).toBe(201)
    const [row] = await db.select().from(newsletterSubscribers).where(like(newsletterSubscribers.email, email))
    expect(row!.unsubscribedAt).toBeNull()
  })
})

describe('Newsletter export', () => {
  const download = (token: string) =>
    fetch(`${base}/api/admin/exports/newsletter?format=csv`, { headers: { Origin: ORIGIN, Cookie: token } })

  it('gives admins the list', async () => {
    const res = await download(admin.token)
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain('Email')
    expect(csv).toContain(email)
  })

  it('is refused to learners', async () => {
    expect((await download(learner.token)).status).toBe(403)
  })
})
