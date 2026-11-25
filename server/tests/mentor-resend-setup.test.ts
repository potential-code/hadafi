import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test'
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { users, mentorRegistrations, mentorSetupTokens } from '../db/schema'
import * as mailer from '../mail/mailer'
import { logger } from '../config/logger'
import { operatorRouteAllowed } from '../auth/operatorScope'
import { approveMentorApplication, resendMentorSetupLink } from '../services/admin.service'
import { startTestServer, stopTestServer, api, signIn, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * "Resend setup link" for approved mentors who have not set up their account
 * (services/admin.service.ts resendMentorSetupLink, POST
 * /api/admin/mentor-applications/:id/resend-setup), and the single setup-token
 * row per registration that approve and resend both replace in place.
 */

const tag = crypto.randomUUID().slice(0, 8)
const emails: string[] = []
let admin: TestUser
let learner: TestUser

/** Every email handed to the mailer, without sending anything. */
let sent: Array<{ to: string; template: string; setupLink: string }> = []
let mailSpy: ReturnType<typeof spyOn>

async function application(status = 'pending', userId: string | null = null): Promise<{ id: string; email: string }> {
  const email = `resend-${tag}-${emails.length}@e2e.local`
  emails.push(email)
  const [row] = await db
    .insert(mentorRegistrations)
    .values({ name: 'E2E Resend Mentor', email, status, userId })
    .returning({ id: mentorRegistrations.id })
  return { id: row!.id, email }
}

const tokenRows = (id: string) => db.select().from(mentorSetupTokens).where(eq(mentorSetupTokens.mentorRegistrationId, id))

/** Moves the registration's token row back in time, past the resend cooldown (and, with `expired`, past its expiry). */
async function age(id: string, expired = false) {
  await db
    .update(mentorSetupTokens)
    .set({
      createdAt: sql`now() - interval '3 days'`,
      ...(expired ? { expiresAt: new Date(Date.now() - 24 * 3600_000) } : {}),
    })
    .where(eq(mentorSetupTokens.mentorRegistrationId, id))
}

const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('resend-learner')
  admin = await createTestUser('resend-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  admin.token = await signIn(admin.email, admin.password)
})

afterEach(() => {
  mailSpy?.mockRestore()
})

afterAll(async () => {
  mailSpy?.mockRestore()
  await db.delete(mentorRegistrations).where(inArray(mentorRegistrations.email, emails))
  await cleanupFixtureUsers()
  await stopTestServer()
})

function captureMail(fail = false) {
  sent = []
  mailSpy = spyOn(mailer, 'sendMail').mockImplementation(async (opts) => {
    if (fail) throw new Error('smtp down')
    sent.push({ to: String(opts.to), template: opts.template, setupLink: String(opts.context['setupLink']) })
  })
}

describe('resendMentorSetupLink (service)', () => {
  it('replaces the expired link: the old token stops working, the new one is valid for 48 h', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    const [first] = await tokenRows(app.id)
    expect(tokenFrom(sent[0]!.setupLink)).toBe(first!.token)
    await age(app.id, true)

    const result = await resendMentorSetupLink(app.id)
    expect(result.email).toBe(app.email)
    expect(result.emailQueued).toBe(true)

    const rows = await tokenRows(app.id)
    expect(rows).toHaveLength(1) // one row per registration, replaced in place
    const [current] = rows
    expect(current!.token).not.toBe(first!.token)
    expect(current!.token).toMatch(/^[0-9a-f]{64}$/)
    expect(current!.usedAt).toBeNull()
    const hours = (current!.expiresAt.getTime() - Date.now()) / 3600_000
    expect(hours).toBeGreaterThan(47.9)
    expect(hours).toBeLessThanOrEqual(48)

    // Same template as the approval, carrying the new token.
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ to: app.email, template: 'mentor-approval' })
    expect(tokenFrom(sent[1]!.setupLink)).toBe(current!.token)

    const oldLink = await api<{ error: { code: string } }>('GET', `/api/mentor/setup-token?token=${first!.token}`)
    expect(oldLink.status).toBe(404)
    const newLink = await api<{ data: { email: string } }>('GET', `/api/mentor/setup-token?token=${current!.token}`)
    expect(newLink.status).toBe(200)
    expect(JSON.stringify(newLink.body)).toContain(app.email)
  })

  it('also replaces a link that has not expired yet, once the cooldown has passed', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    await age(app.id)
    const [before] = await tokenRows(app.id)
    await resendMentorSetupLink(app.id)
    const [after] = await tokenRows(app.id)
    expect(after!.token).not.toBe(before!.token)
    expect((await api('GET', `/api/mentor/setup-token?token=${before!.token}`)).status).toBe(404)
  })

  it('refuses a second resend within 60 seconds and leaves the current link alone', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    await expect(resendMentorSetupLink(app.id)).rejects.toMatchObject({ statusCode: 429, code: 'RESEND_TOO_SOON' })

    await age(app.id)
    await resendMentorSetupLink(app.id)
    const [current] = await tokenRows(app.id)
    await expect(resendMentorSetupLink(app.id)).rejects.toMatchObject({ statusCode: 429, code: 'RESEND_TOO_SOON' })
    expect((await tokenRows(app.id))[0]!.token).toBe(current!.token)
    expect(sent).toHaveLength(2) // approval + one resend
  })

  it('two resends at the same moment send one link', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    await age(app.id)
    const results = await Promise.allSettled([resendMentorSetupLink(app.id), resendMentorSetupLink(app.id)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'RESEND_TOO_SOON' })
    expect(sent).toHaveLength(2)
  })

  it('refuses pending and rejected applications, mentors with an account, used links and unknown ids', async () => {
    captureMail()
    const pending = await application('pending')
    await expect(resendMentorSetupLink(pending.id)).rejects.toMatchObject({ statusCode: 400, code: 'NOT_RESENDABLE' })
    const rejected = await application('rejected')
    await expect(resendMentorSetupLink(rejected.id)).rejects.toMatchObject({ statusCode: 400, code: 'NOT_RESENDABLE' })

    const mentorUser = await createTestUser('resend-has-account')
    const setUp = await application('approved', mentorUser.id)
    await expect(resendMentorSetupLink(setUp.id)).rejects.toMatchObject({ statusCode: 400, code: 'ALREADY_SET_UP' })

    // Account created from the link and later removed: no new login by resend.
    const used = await application('approved')
    await db.insert(mentorSetupTokens).values({
      mentorRegistrationId: used.id,
      token: crypto.randomUUID().replaceAll('-', '').repeat(2),
      expiresAt: new Date(Date.now() - 3600_000),
      usedAt: new Date(Date.now() - 2 * 3600_000),
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    })
    await expect(resendMentorSetupLink(used.id)).rejects.toMatchObject({ statusCode: 400, code: 'ALREADY_SET_UP' })

    await expect(resendMentorSetupLink(crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(sent).toHaveLength(0)
  })

  it('an approved application with no token row at all gets one', async () => {
    captureMail()
    const app = await application('approved')
    const result = await resendMentorSetupLink(app.id)
    expect(result.emailQueued).toBe(true)
    expect(await tokenRows(app.id)).toHaveLength(1)
  })

  it('logs a failed email and reports it, keeping the new link', async () => {
    captureMail(true)
    const quiet = spyOn(logger, 'error').mockImplementation(() => undefined as never)
    try {
      const app = await application('approved')
      const result = await resendMentorSetupLink(app.id)
      expect(result.emailQueued).toBe(false)
      expect(quiet).toHaveBeenCalled()
      expect(await tokenRows(app.id)).toHaveLength(1)
    } finally {
      quiet.mockRestore()
    }
  })
})

describe('approveMentorApplication with an old token row', () => {
  it('replaces a leftover expired token row instead of failing (after a manual status reset)', async () => {
    captureMail()
    const app = await application('pending')
    const oldToken = crypto.randomUUID().replaceAll('-', '').repeat(2)
    await db.insert(mentorSetupTokens).values({
      mentorRegistrationId: app.id,
      token: oldToken,
      expiresAt: new Date(Date.now() - 24 * 3600_000),
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    })

    const result = await approveMentorApplication(app.id)
    expect(result.emailQueued).toBe(true)
    const rows = await tokenRows(app.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.token).not.toBe(oldToken)
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000)
    const [reg] = await db.select().from(mentorRegistrations).where(eq(mentorRegistrations.id, app.id))
    expect(reg!.status).toBe('approved')
    expect((await api('GET', `/api/mentor/setup-token?token=${rows[0]!.token}`)).status).toBe(200)
  })
})

describe('POST /api/admin/mentor-applications/:id/resend-setup', () => {
  const path = (id: string) => `/api/admin/mentor-applications/${id}/resend-setup`

  it('an admin resends: 200 with the address and whether the email was queued, never the token', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    await age(app.id, true)

    const res = await api<{ success: boolean; data: { email: string; emailQueued: boolean; expiresAt: string } }>('POST', path(app.id), {
      token: admin.token,
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ email: app.email, emailQueued: true })
    const [current] = await tokenRows(app.id)
    expect(JSON.stringify(res.body)).not.toContain(current!.token)
    expect(JSON.stringify(res.body)).not.toMatch(/token/i)

    const again = await api<{ error: { code: string; message: string } }>('POST', path(app.id), { token: admin.token })
    expect(again.status).toBe(429)
    expect(again.body.error.code).toBe('RESEND_TOO_SOON')
    expect(again.body.error.message).toContain('less than a minute ago')
  })

  it('returns the clear error codes for wrong status and unknown ids', async () => {
    captureMail()
    const pending = await application('pending')
    const res = await api<{ error: { code: string } }>('POST', path(pending.id), { token: admin.token })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('NOT_RESENDABLE')
    expect((await api('POST', path(crypto.randomUUID()), { token: admin.token })).status).toBe(404)
  })

  it('refuses non-admins and anonymous callers without changing anything', async () => {
    captureMail()
    const app = await application()
    await approveMentorApplication(app.id)
    await age(app.id, true)
    const [before] = await tokenRows(app.id)

    expect((await api('POST', path(app.id), { token: learner.token })).status).toBe(403)
    expect((await api('POST', path(app.id))).status).toBe(401)
    expect((await tokenRows(app.id))[0]!.token).toBe(before!.token)
    expect(sent).toHaveLength(1) // the approval only
  })

  it('is not open to operator keys (it hands out a login, like approve)', () => {
    expect(operatorRouteAllowed('POST', path(crypto.randomUUID()))).toBe(false)
  })
})

describe('GET /api/admin/mentor-applications', () => {
  it('says whether each mentor has an account, without user ids or tokens', async () => {
    captureMail()
    const mentorUser = await createTestUser('resend-listed')
    const withAccount = await application('approved', mentorUser.id)
    const without = await application()
    await approveMentorApplication(without.id)
    const [tok] = await tokenRows(without.id)

    const res = await api<{ data: Array<Record<string, unknown>> }>('GET', '/api/admin/mentor-applications', { token: admin.token })
    expect(res.status).toBe(200)
    const byEmail = new Map(res.body.data.map((a) => [a['email'], a]))
    expect(byEmail.get(withAccount.email)).toMatchObject({ status: 'approved', hasAccount: true })
    expect(byEmail.get(without.email)).toMatchObject({ status: 'approved', hasAccount: false })
    expect(byEmail.get(without.email)).not.toHaveProperty('userId')
    expect(JSON.stringify(res.body)).not.toContain(tok!.token)
    expect(JSON.stringify(res.body)).not.toContain(mentorUser.id)
  })
})
