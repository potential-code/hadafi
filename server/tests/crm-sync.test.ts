import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test'
import crypto from 'node:crypto'
import fs from 'fs'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  authVerifications,
  courseCertificates,
  courseEnrollments,
  courses,
  crmOutbox,
  learnerActivityDays,
  mentorRegistrations,
  mentorSetupTokens,
  userBadges,
  users,
} from '../db/schema'
import { checkBadges } from '../services/achievements.service'
import { issueCertificate, setCertificateRendererForTests } from '../services/lms/certificate.service'
import {
  MARKETING_CONSENT_TEXT,
  buildCrmPayload,
  crmEventKey,
  crmOutboxCounts,
  runCrmSync,
  withdrawCourseCompleted,
} from '../services/crmSync.service'
import { logger } from '../config/logger'
import { startTestServer, stopTestServer, api, cookieHeader, cleanupFixtureUsers, createTestUser, fixtureEmail } from './helpers'

/**
 * CRM sync: consent captured at sign-up, learner events queued in crm_outbox
 * (registration, first activation, course completed, consent changes) and a
 * drain that sends them to the CRM with retries. The CRM itself is a fake
 * fetch here. Ported from SMEEP's suite; the payload contract is the same.
 */

/** This run's throwaway addresses (removed by cleanupFixtureUsers). */
const freshEmail = fixtureEmail
/** The profile's email settings (announcement emails, and marketing for learners). */
const PREFS = '/api/me/announcements/email-preference'
type Payload = Record<string, unknown> & { event: Record<string, unknown> }

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('base64url')

/** What the sign-up code step leaves behind: a verified token for this email (no Mailpit needed). */
async function verifiedTokenFor(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  await db.insert(authVerifications).values({
    identifier: `hadafi-sign-up-verified-${email}`,
    value: sha256(token),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  })
  return token
}

async function signUp(body: Record<string, unknown>) {
  const email = body['email'] as string
  return api<{ user?: { id: string }; code?: string; message?: string }>('POST', '/api/auth/hadafi/sign-up', {
    body: { fullName: 'E2E Consent', country: 'United Arab Emirates', verifiedToken: await verifiedTokenFor(email), ...body },
  })
}

async function userByEmail(email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email))
  return u
}

async function outboxFor(userId: string) {
  return db.select().from(crmOutbox).where(eq(crmOutbox.userId, userId))
}

/** Signs up a learner through the real endpoint (terms accepted) and returns their id + cookie. */
async function signedUpLearner(prefix: string, marketingOptIn = false) {
  const email = freshEmail(prefix)
  const res = await signUp({ email, password: 'e2e-pass-12345', termsAccepted: true, marketingOptIn })
  expect(res.status).toBe(200)
  const u = await userByEmail(email)
  return { id: u!.id, email, token: cookieHeader(res.setCookie) }
}

beforeAll(async () => {
  await startTestServer()
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('sign-up consent', () => {
  it('refuses a new sign-up without the Terms accepted, and keeps the verified email', async () => {
    const email = freshEmail('noterms')
    const token = await verifiedTokenFor(email)
    const res = await api<{ code: string; message: string }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'No Terms', email, country: 'Jordan', password: 'e2e-pass-12345', verifiedToken: token },
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TERMS_REQUIRED')
    expect(res.body.message).toMatch(/Terms of Use and Privacy Policy/)
    // A page loaded before this release has no box: the message says how to get it.
    expect(res.body.message).toMatch(/refresh the page/)
    expect(await userByEmail(email)).toBeUndefined()

    const declined = await api<{ code: string }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'No Terms', email, country: 'Jordan', verifiedToken: token, termsAccepted: false },
    })
    expect(declined.status).toBe(400)
    expect(declined.body.code).toBe('TERMS_REQUIRED')

    // The same token still works once the box is ticked.
    const ok = await api('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'No Terms', email, country: 'Jordan', verifiedToken: token, termsAccepted: true },
    })
    expect(ok.status).toBe(200)
  })

  it('records Terms acceptance and leaves marketing off when only the Terms box is ticked', async () => {
    const before = Date.now()
    const { id } = await signedUpLearner('terms-only')
    const [u] = await db.select().from(users).where(eq(users.id, id))
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date)
    expect(u!.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 5_000)
    expect(u!.marketingOptIn).toBe(false)
    expect(u!.marketingOptInAt).toBeNull()
    expect(u!.marketingConsentText).toBeNull()
  })

  it('stores marketing consent with the server-side wording, whatever the client sends', async () => {
    const email = freshEmail('optin')
    const res = await signUp({
      email,
      termsAccepted: true,
      marketingOptIn: true,
      marketingConsentText: 'I agree to anything',
    })
    expect(res.status).toBe(200)
    const u = await userByEmail(email)
    expect(u!.marketingOptIn).toBe(true)
    expect(u!.marketingOptInAt).toBeInstanceOf(Date)
    expect(u!.marketingConsentText).toBe(MARKETING_CONSENT_TEXT)
    expect(MARKETING_CONSENT_TEXT).toBe(
      'Send me programme updates, offers and event invitations from the Potential.org Foundation. You can unsubscribe at any time.',
    )
  })

  it('accepts the chat sign-up shape (no password) with the same consent fields', async () => {
    const email = freshEmail('chat')
    const res = await signUp({ email, couponCode: undefined, termsAccepted: true, marketingOptIn: false })
    expect(res.status).toBe(200)
    const u = await userByEmail(email)
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date)
    expect(u!.marketingOptIn).toBe(false)
  })
})

describe('registration event', () => {
  it('queues one registration event with the frozen CRM payload', async () => {
    const { id, email } = await signedUpLearner('reg', true)
    const rows = await outboxFor(id)
    expect(rows.map((r) => r.eventKey)).toEqual([`hadafi:reg:${id}`])
    const p = rows[0]!.payload as Payload
    expect(p).toMatchObject({
      intakeType: 'b2c',
      email,
      fullName: 'E2E Consent',
      submissionId: `hadafi:reg:${id}`,
      fields: { country: 'United Arab Emirates' },
      event: { type: 'registration', marketingOptIn: true, marketingConsentText: MARKETING_CONSENT_TEXT },
    })
    const [u] = await db.select().from(users).where(eq(users.id, id))
    expect(p.event['occurredAt']).toBe(u!.termsAcceptedAt!.toISOString())
    expect(typeof p.event['marketingConsentAt']).toBe('string')
    // Never phone, company or a newsletter flag.
    expect(Object.keys(p).sort()).toEqual(
      ['email', 'event', 'fields', 'fullName', 'intakeType', 'programId', 'submissionId', ...('cohortId' in p ? ['cohortId'] : [])].sort(),
    )
    expect(JSON.stringify(p)).not.toMatch(/phone|company|newsletter/i)
    expect(rows[0]!.sentAt).toBeNull()
    expect(rows[0]!.attempts).toBe(0)
  })

  it('leaves the consent text out of the payload when the learner did not opt in', async () => {
    const { id } = await signedUpLearner('reg-no-optin')
    const [row] = await outboxFor(id)
    const event = (row!.payload as Payload).event
    expect(event.marketingOptIn).toBe(false)
    expect(event.marketingConsentText).toBeUndefined()
    expect(event.marketingConsentAt).toBeUndefined()
  })

  it('queues nothing for a mentor account', async () => {
    const email = freshEmail('mentor-crm')
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const [reg] = await db
      .insert(mentorRegistrations)
      .values({ name: 'CRM Mentor', email, status: 'approved' })
      .returning({ id: mentorRegistrations.id })
    await db.insert(mentorSetupTokens).values({ mentorRegistrationId: reg!.id, token, expiresAt: new Date(Date.now() + 3_600_000) })
    const res = await api('POST', '/api/auth/hadafi/mentor-setup', { body: { token, password: 'mentor-pass-123' } })
    expect(res.status).toBe(200)
    const u = await userByEmail(email)
    expect(await outboxFor(u!.id)).toEqual([])
    await db.delete(mentorRegistrations).where(eq(mentorRegistrations.id, reg!.id))
  })

  it('still creates the account when the outbox insert fails', async () => {
    // A real database failure on the outbox insert, for this one email only.
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION e2e_crm_outbox_fail() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'e2e: outbox insert refused'; END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS e2e_crm_outbox_fail ON crm_outbox;
      CREATE TRIGGER e2e_crm_outbox_fail BEFORE INSERT ON crm_outbox FOR EACH ROW
        WHEN (NEW.payload->>'email' LIKE 'outbox-fail-%') EXECUTE FUNCTION e2e_crm_outbox_fail();
    `))
    const quiet = spyOn(logger, 'error').mockImplementation(() => undefined as never)
    try {
      const email = freshEmail('outbox-fail')
      const res = await signUp({ email, password: 'e2e-pass-12345', termsAccepted: true, marketingOptIn: true })
      expect(res.status).toBe(200)
      const u = await userByEmail(email)
      expect(u).toBeDefined()
      expect(u!.termsAcceptedAt).toBeInstanceOf(Date)
      expect(u!.marketingOptIn).toBe(true)
      expect(await outboxFor(u!.id)).toEqual([])
      expect(quiet).toHaveBeenCalled()
      // The log line names the event, not the learner (no SQL params).
      const logged = JSON.stringify(quiet.mock.calls, (_k, v) => (v instanceof Error ? { ...v, message: v.message, stack: v.stack } : v))
      expect(logged).toContain('hadafi:reg:')
      expect(logged).not.toContain(email)
      expect(logged).not.toContain('E2E Consent')
    } finally {
      quiet.mockRestore()
      await db.execute(sql.raw(`
        DROP TRIGGER IF EXISTS e2e_crm_outbox_fail ON crm_outbox;
        DROP FUNCTION IF EXISTS e2e_crm_outbox_fail();
      `))
    }
  })
})

describe('first activation and course completion events', () => {
  it('queues first activation once, when first_step is newly earned', async () => {
    const { id } = await signedUpLearner('act1')
    await checkBadges(id)
    expect((await outboxFor(id)).map((r) => r.eventKey)).toEqual([`hadafi:reg:${id}`])

    await db.insert(learnerActivityDays).values({ userId: id, day: '2026-11-16', steps: 1 })
    await checkBadges(id)
    await checkBadges(id)
    let keys = (await outboxFor(id)).map((r) => r.eventKey).sort()
    expect(keys).toEqual([`hadafi:act1:${id}`, `hadafi:reg:${id}`])

    // Earning the badge again (e.g. after it was removed) does not queue a second event.
    await db.delete(userBadges).where(and(eq(userBadges.userId, id), eq(userBadges.badge, 'first_step')))
    await checkBadges(id)
    keys = (await outboxFor(id)).map((r) => r.eventKey).sort()
    expect(keys).toEqual([`hadafi:act1:${id}`, `hadafi:reg:${id}`])

    const [act] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, `hadafi:act1:${id}`))
    expect((act!.payload as Payload).event).toMatchObject({ type: 'first_activation', marketingOptIn: false })
  })

  it('carries the consent the learner has when the event happens', async () => {
    const { id, token } = await signedUpLearner('act1-consent')
    expect((await api('PUT', PREFS, { token, body: { marketing: true } })).status).toBe(200)
    await db.insert(learnerActivityDays).values({ userId: id, day: '2026-11-16', steps: 2 })
    await checkBadges(id)
    const [act] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, `hadafi:act1:${id}`))
    expect((act!.payload as Payload).event).toMatchObject({
      type: 'first_activation',
      marketingOptIn: true,
      marketingConsentText: MARKETING_CONSENT_TEXT,
    })
  })

  it('sends a withdrawal as marketingOptIn false with the time it was turned off', async () => {
    const { id, token } = await signedUpLearner('withdraw', true)
    const [reg] = await outboxFor(id)
    const regAt = (reg!.payload as Payload).event['marketingConsentAt'] as string
    await new Promise((r) => setTimeout(r, 20))
    expect((await api('PUT', PREFS, { token, body: { marketing: false } })).status).toBe(200)
    const [u] = await db.select().from(users).where(eq(users.id, id))
    await db.insert(learnerActivityDays).values({ userId: id, day: '2026-11-16', steps: 1 })
    await checkBadges(id)
    const [act] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, `hadafi:act1:${id}`))
    const event = (act!.payload as Payload).event
    expect(event['marketingOptIn']).toBe(false)
    expect(event['marketingConsentAt']).toBe(u!.marketingOptInAt!.toISOString())
    expect(Date.parse(event['marketingConsentAt'] as string)).toBeGreaterThan(Date.parse(regAt))
    expect(event['marketingConsentText']).toBeUndefined()
    // The registration event already queued keeps what was true then.
    expect((await outboxFor(id)).find((r) => r.eventKey.startsWith('hadafi:reg:'))!.payload).toEqual(reg!.payload)
  })

  it('turning marketing off when it was never on records no withdrawal', async () => {
    const { id, token } = await signedUpLearner('never-on')
    expect((await api('PUT', PREFS, { token, body: { marketing: false } })).status).toBe(200)
    const [u] = await db.select().from(users).where(eq(users.id, id))
    expect(u!.marketingOptInAt).toBeNull()
    await db.insert(learnerActivityDays).values({ userId: id, day: '2026-11-16', steps: 1 })
    await checkBadges(id)
    const [act] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, `hadafi:act1:${id}`))
    const event = (act!.payload as Payload).event
    expect(event['marketingOptIn']).toBe(false)
    expect(event['marketingConsentAt']).toBeUndefined()
  })

  it('queues nothing for learners who signed up before consent was recorded', async () => {
    const [legacy] = await db
      .insert(users)
      .values({ fullName: 'E2E Legacy', email: freshEmail('legacy'), emailVerified: true, role: 'sme', country: 'Egypt' })
      .returning({ id: users.id })
    await db.insert(learnerActivityDays).values({ userId: legacy!.id, day: '2026-11-16', steps: 1 })
    await checkBadges(legacy!.id)
    expect(await outboxFor(legacy!.id)).toEqual([])
  })

  it('queues course completion once per course when a certificate is issued', async () => {
    const { id } = await signedUpLearner('cert-crm')
    const published = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, 'published')).limit(2)
    if (published.length < 2) throw new Error('Seed courses first: need two published courses')
    try {
      for (const c of published) {
        await db.insert(courseEnrollments).values({ userId: id, courseId: c.id }).onConflictDoNothing()
        await issueCertificate(id, c.id)
      }
      // Issuing again for the first course is refused (one certificate per course) and queues nothing new.
      await issueCertificate(id, published[0]!.id).catch(() => undefined)

      const certRows = (await outboxFor(id)).filter((r) => r.eventKey.startsWith('hadafi:cert:'))
      expect(certRows.map((r) => r.eventKey).sort()).toEqual(published.map((c) => `hadafi:cert:${id}:${c.id}`).sort())
      const first = certRows.find((r) => r.eventKey.endsWith(published[0]!.id))!
      expect((first.payload as Payload).event).toMatchObject({
        type: 'course_completed',
        courseId: published[0]!.id,
        courseName: published[0]!.title,
      })
    } finally {
      const rows = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, id))
      for (const r of rows) if (r.filePath) fs.rmSync(r.filePath, { force: true })
      await db.delete(courseCertificates).where(eq(courseCertificates.userId, id))
    }
  })
})

describe('certificate that cannot be drawn (Hadafi)', () => {
  it('takes back the unsent course completion with the certificate, and queues it again when one is issued', async () => {
    const { id } = await signedUpLearner('cert-undrawn')
    const [course] = await db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, 'published')).limit(1)
    if (!course) throw new Error('Seed courses first: need a published course')
    const key = `hadafi:cert:${id}:${course.id}`
    await db.insert(courseEnrollments).values({ userId: id, courseId: course.id }).onConflictDoNothing()
    try {
      // Drawing fails: the certificate row is taken back out, and its event with it.
      setCertificateRendererForTests(async () => {
        throw new Error('drawing failed (test)')
      })
      await expect(issueCertificate(id, course.id)).rejects.toThrow('drawing failed (test)')
      expect(await db.select().from(courseCertificates).where(eq(courseCertificates.userId, id))).toEqual([])
      expect((await outboxFor(id)).map((r) => r.eventKey)).not.toContain(key)
    } finally {
      setCertificateRendererForTests(null)
    }
    try {
      await issueCertificate(id, course.id)
      expect((await outboxFor(id)).map((r) => r.eventKey)).toContain(key)
    } finally {
      const rows = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, id))
      for (const r of rows) if (r.filePath) fs.rmSync(r.filePath, { force: true })
      await db.delete(courseCertificates).where(eq(courseCertificates.userId, id))
    }
  })
})

describe('marketing consent setting', () => {
  it('learners can turn marketing on and off later; each change is timed', async () => {
    const { id, token } = await signedUpLearner('settings')
    const initial = await api<{ data: { announcements: boolean; emailEnabled: boolean; marketing: boolean } }>('GET', PREFS, { token })
    expect(initial.body.data).toEqual({ announcements: true, emailEnabled: expect.any(Boolean), marketing: false })

    expect((await api('PUT', PREFS, { token, body: { marketing: true } })).status).toBe(200)
    let [u] = await db.select().from(users).where(eq(users.id, id))
    expect(u!.marketingOptIn).toBe(true)
    expect(u!.marketingConsentText).toBe(MARKETING_CONSENT_TEXT)
    const onAt = u!.marketingOptInAt!
    expect(onAt).toBeInstanceOf(Date)
    // Announcement emails are a separate setting (Hadafi keeps opt-outs in their own table): unchanged.
    expect((await api<{ data: { announcements: boolean } }>('GET', PREFS, { token })).body.data.announcements).toBe(true)

    await new Promise((r) => setTimeout(r, 20))
    expect((await api('PUT', PREFS, { token, body: { marketing: false } })).status).toBe(200)
    ;[u] = await db.select().from(users).where(eq(users.id, id))
    expect(u!.marketingOptIn).toBe(false)
    expect(u!.marketingOptInAt!.getTime()).toBeGreaterThan(onAt.getTime())

    const after = await api<{ data: { announcements: boolean; emailEnabled: boolean; marketing: boolean } }>('GET', PREFS, { token })
    expect(after.body.data).toEqual({ announcements: true, emailEnabled: expect.any(Boolean), marketing: false })
  })

  it("refuses marketing for a mentor (NOT_A_LEARNER) and leaves their announcements as they were", async () => {
    const mentor = await createTestUser('crm-mentor-prefs', 'mentor')
    const before = await api<{ data: Record<string, unknown> }>('GET', PREFS, { token: mentor.token })
    expect(before.status).toBe(200)
    expect(before.body.data['announcements']).toBe(true)

    for (const body of [{ marketing: true }, { marketing: true, announcements: false }]) {
      const res = await api<{ error: { code: string } }>('PUT', PREFS, { token: mentor.token, body })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('NOT_A_LEARNER')
    }

    const after = await api<{ data: Record<string, unknown> }>('GET', PREFS, { token: mentor.token })
    expect(after.body.data).toEqual(before.body.data)
    const [u] = await db.select().from(users).where(eq(users.id, mentor.id))
    expect(u!.marketingOptIn).toBe(false)
    expect(u!.marketingOptInAt).toBeNull()
    expect(await outboxFor(mentor.id)).toEqual([])
  })

  it("a mentor's settings have no marketing field", async () => {
    const mentor = await createTestUser('crm-mentor-get', 'mentor')
    const res = await api<{ data: Record<string, unknown> }>('GET', PREFS, { token: mentor.token })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ announcements: true, emailEnabled: expect.any(Boolean) })
    expect('marketing' in res.body.data).toBe(false)
  })

  it('still accepts the announcements-only body, and rejects an empty one', async () => {
    const { token } = await signedUpLearner('settings-ann')
    expect((await api('PUT', PREFS, { token, body: { announcements: false } })).status).toBe(200)
    expect((await api('PUT', PREFS, { token, body: {} })).status).toBe(422)
  })
})

describe('payload limits', () => {
  const learner = {
    id: 'u1',
    email: 'limits@example.test',
    country: 'Jordan',
    marketingOptIn: false,
    marketingOptInAt: null,
    marketingConsentText: null,
  }

  it("cuts the full name and course name to the CRM's 300 characters", () => {
    const long = 'A'.repeat(299) + '😀' + 'B'.repeat(50)
    const p = buildCrmPayload('k', { ...learner, fullName: `  ${long}  ` }, {
      type: 'course_completed',
      occurredAt: new Date(),
      courseId: 'c1',
      courseName: 'C'.repeat(400),
    }, { CRM_PROGRAM_ID: PROGRAM_ID }) as Payload
    expect((p['fullName'] as string).length).toBeLessThanOrEqual(300)
    // Never half an emoji.
    expect(p['fullName']).toBe('A'.repeat(299))
    expect((p.event['courseName'] as string).length).toBe(300)
  })

  it('leaves out a program or cohort id that is not a UUID', () => {
    const p = buildCrmPayload('k', { ...learner, fullName: 'X' }, { type: 'registration', occurredAt: new Date() }, {
      CRM_PROGRAM_ID: 'hadafi-programme',
      CRM_COHORT_ID: 'cohort-9',
    })
    expect(p['programId']).toBeNull()
    expect('cohortId' in p).toBe(false)
  })
})

describe('consent changes', () => {
  async function keysFor(userId: string) {
    return (await outboxFor(userId)).map((r) => r.eventKey).sort()
  }

  it('queues a consent_changed event for each real change, with the new consent', async () => {
    const { id, token } = await signedUpLearner('consent-evt')
    // Off → off is no change.
    await api('PUT', PREFS, { token, body: { marketing: false } })
    expect(await keysFor(id)).toEqual([`hadafi:reg:${id}`])

    await api('PUT', PREFS, { token, body: { marketing: true } })
    let [u] = await db.select().from(users).where(eq(users.id, id))
    const onAt = u!.marketingOptInAt!
    const onKey = `hadafi:consent:${id}:${onAt.getTime()}`
    expect(await keysFor(id)).toEqual([onKey, `hadafi:reg:${id}`])
    const [onRow] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, onKey))
    expect(onRow!.payload).toMatchObject({
      submissionId: onKey,
      event: { type: 'consent_changed', occurredAt: onAt.toISOString(), marketingOptIn: true, marketingConsentText: MARKETING_CONSENT_TEXT, marketingConsentAt: onAt.toISOString() },
    })

    await new Promise((r) => setTimeout(r, 5))
    await api('PUT', PREFS, { token, body: { marketing: false } })
    ;[u] = await db.select().from(users).where(eq(users.id, id))
    const offAt = u!.marketingOptInAt!
    const offKey = `hadafi:consent:${id}:${offAt.getTime()}`
    const [offRow] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, offKey))
    const event = (offRow!.payload as Payload).event
    expect(event).toMatchObject({ type: 'consent_changed', occurredAt: offAt.toISOString(), marketingOptIn: false, marketingConsentAt: offAt.toISOString() })
    expect(event['marketingConsentText']).toBeUndefined()
    expect(await keysFor(id)).toHaveLength(3)
  })

  it('an existing learner who opts in enters the CRM: registration at their sign-up time, then the consent change', async () => {
    const legacy = await createTestUser('legacy-optin')
    const prefs = await api<{ data: { marketing: boolean } }>('GET', PREFS, { token: legacy.token })
    expect(prefs.body.data.marketing).toBe(false)
    // Never opted in: nothing synced, even when they "turn it off".
    await api('PUT', PREFS, { token: legacy.token, body: { marketing: false } })
    expect(await keysFor(legacy.id)).toEqual([])

    await api('PUT', PREFS, { token: legacy.token, body: { marketing: true } })
    const [u] = await db.select().from(users).where(eq(users.id, legacy.id))
    const keys = await keysFor(legacy.id)
    expect(keys).toEqual([`hadafi:consent:${legacy.id}:${u!.marketingOptInAt!.getTime()}`, `hadafi:reg:${legacy.id}`])
    const [reg] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, `hadafi:reg:${legacy.id}`))
    expect(reg!.payload).toMatchObject({
      event: { type: 'registration', occurredAt: u!.createdAt.toISOString(), marketingOptIn: true, marketingConsentText: MARKETING_CONSENT_TEXT },
    })

    // Now in the CRM: later events flow, and the registration is sent before the consent change.
    await db.insert(learnerActivityDays).values({ userId: legacy.id, day: '2026-11-16', steps: 1 })
    await checkBadges(legacy.id)
    expect(await keysFor(legacy.id)).toContain(`hadafi:act1:${legacy.id}`)
    const { fn, calls } = fakeFetch(() => json(200))
    await runCrmSync({ fetch: fn, env: CONFIG, userId: legacy.id })
    const types = calls.map((c) => JSON.parse(String(c.init.body)).event.type)
    expect(types[0]).toBe('registration')
    expect(types.slice(1).sort()).toEqual(['consent_changed', 'first_activation'])

    // Opting in again later does not queue a second registration.
    await api('PUT', PREFS, { token: legacy.token, body: { marketing: false } })
    await api('PUT', PREFS, { token: legacy.token, body: { marketing: true } })
    expect((await keysFor(legacy.id)).filter((k) => k.startsWith('hadafi:reg:'))).toHaveLength(1)
  })

  it('sends the consent the learner has at send time, and keeps it for retries', async () => {
    const { id, token } = await signedUpLearner('fresh', true)
    await new Promise((r) => setTimeout(r, 5))
    await api('PUT', PREFS, { token, body: { marketing: false } })
    const [u] = await db.select().from(users).where(eq(users.id, id))
    const regKey = `hadafi:reg:${id}`
    const { fn, calls } = fakeFetch(() => json(503))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: regKey })
    const sent = JSON.parse(String(calls[0]!.init.body)) as Payload
    expect(sent.event).toMatchObject({ type: 'registration', marketingOptIn: false, marketingConsentAt: u!.marketingOptInAt!.toISOString() })
    expect(sent.event['marketingConsentText']).toBeUndefined()
    const stored = (await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, regKey)))[0]!
    expect(stored.payload).toEqual(sent)

    // A retry after another change sends exactly the same bytes.
    await api('PUT', PREFS, { token, body: { marketing: true } })
    await db.update(crmOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(crmOutbox.eventKey, regKey))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: regKey })
    expect(String(calls[1]!.init.body)).toBe(String(calls[0]!.init.body))
  })
})

// ── Drain ───────────────────────────────────────────────────────────────────

const RUN = crypto.randomUUID().slice(0, 8)
const PREFIX = `e2e-drain:${RUN}:`
const PROGRAM_ID = '7d1f4c2a-5b8e-4f3a-9c6d-2e1b0a9f8e7d'
const COHORT_ID = 'c0a1b2c3-d4e5-4f60-8a9b-0c1d2e3f4a5b'
const CONFIG = {
  CRM_SYNC_ENABLED: 'true',
  CRM_INTAKE_URL: 'https://crm.example.test/api/intake',
  POTENTIAL_CRM_INTAKE_KEY: 'test-key',
  CRM_PROGRAM_ID: PROGRAM_ID,
}

async function queue(name: string, extra: Partial<typeof crmOutbox.$inferInsert> = {}) {
  const eventKey = `${PREFIX}${name}`
  await db.insert(crmOutbox).values({ eventKey, payload: { submissionId: eventKey, programId: PROGRAM_ID }, ...extra })
  return eventKey
}

async function row(eventKey: string) {
  const [r] = await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, eventKey))
  return r!
}

type Call = { url: string; init: RequestInit }
function fakeFetch(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond(JSON.parse(String(init?.body ?? '{}')))
  }) as typeof fetch
  return { fn, calls }
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('drain', () => {
  afterAll(async () => {
    await db.delete(crmOutbox).where(like(crmOutbox.eventKey, `${PREFIX}%`))
  })

  it('sends due rows with the key and frozen payload, and marks 2xx (including duplicates) as sent', async () => {
    const a = await queue('ok-a')
    const b = await queue('ok-dup')
    const { fn, calls } = fakeFetch((body) => json(body['submissionId'] === b ? 200 : 201, body['submissionId'] === b ? { duplicate: true } : { id: 'x' }))
    const result = await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: PREFIX })
    expect(result.sent).toBe(2)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toBe(CONFIG.CRM_INTAKE_URL)
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(calls[0]!.init.method).toBe('POST')
    for (const k of [a, b]) {
      const r = await row(k)
      expect(r.sentAt).toBeInstanceOf(Date)
      expect(r.lastError).toBeNull()
    }
    // Sent rows are not sent again.
    const again = fakeFetch(() => json(200))
    await runCrmSync({ fetch: again.fn, env: CONFIG, eventKeyPrefix: PREFIX })
    expect(again.calls).toHaveLength(0)
  })

  it('backs off on 429, 5xx and network errors, doubling up to 6 hours', async () => {
    const k429 = await queue('r429')
    const k503 = await queue('r5-503')
    const knet = await queue('r5-net')
    const k429b = await queue('r429-later')
    const { fn, calls } = fakeFetch((body) => {
      if (body['submissionId'] === knet) throw new TypeError('fetch failed')
      return json(String(body['submissionId']).includes('r429') ? 429 : 503)
    })
    const start = Date.now()
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}r5-` })
    // A 429 also ends the run: the CRM asked us to slow down.
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}r429` })
    expect(calls.filter((c) => String(c.init.body).includes('r429'))).toHaveLength(1)
    const untried = [k429, k429b].map(async (k) => (await row(k)).attempts)
    expect((await Promise.all(untried)).sort()).toEqual([0, 1])
    for (const k of [k503, knet, k429, k429b]) {
      const r = await row(k)
      if (r.attempts === 0) continue
      expect(r.attempts).toBe(1)
      expect(r.sentAt).toBeNull()
      expect(r.lastError).toBeTruthy()
      const wait = r.nextAttemptAt.getTime() - start
      expect(wait).toBeGreaterThan(55_000)
      expect(wait).toBeLessThan(70_000)
    }

    // Second failure: two minutes. Many failures: capped at six hours.
    await db.update(crmOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000), attempts: 1 }).where(eq(crmOutbox.eventKey, k503))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}r5-503` })
    let r = await row(k503)
    expect(r.attempts).toBe(2)
    expect(r.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(115_000)

    await db.update(crmOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000), attempts: 12 }).where(eq(crmOutbox.eventKey, k503))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}r5-503` })
    r = await row(k503)
    expect(r.attempts).toBe(13)
    const capped = r.nextAttemptAt.getTime() - Date.now()
    expect(capped).toBeGreaterThan(6 * 3600_000 - 10_000)
    expect(capped).toBeLessThanOrEqual(6 * 3600_000 + 1000)
  })

  it('gives up after 20 attempts and keeps the row', async () => {
    const k = await queue('giveup', { attempts: 19 })
    const quiet = spyOn(logger, 'error').mockImplementation(() => undefined as never)
    const { fn } = fakeFetch(() => json(500))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}giveup` })
    quiet.mockRestore()
    const r = await row(k)
    expect(r.attempts).toBe(20)
    expect(r.sentAt).toBeNull()
    expect(r.lastError).toMatch(/500/)
    await db.update(crmOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(crmOutbox.eventKey, k))
    const after = fakeFetch(() => json(200))
    await runCrmSync({ fetch: after.fn, env: CONFIG, eventKeyPrefix: `${PREFIX}giveup` })
    expect(after.calls).toHaveLength(0)
  })

  it('does not retry a 409 (marked sent, conflict noted) or another 4xx (given up)', async () => {
    const k409 = await queue('c409')
    const k422 = await queue('c422')
    const quiet = spyOn(logger, 'error').mockImplementation(() => undefined as never)
    // CRM error bodies can echo the learner's details: only the status and the CRM's error code are kept.
    const { fn } = fakeFetch((body) =>
      body['submissionId'] === k409
        ? json(409, { error: { code: 'SUBMISSION_CONFLICT', message: 'jane.doe@example.org (Jane Doe) differs' } })
        : json(422, { code: 'INVALID_FIELD', message: 'fullName Jane Doe is invalid' }),
    )
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: PREFIX })
    expect(quiet).toHaveBeenCalled()
    const logged = JSON.stringify(quiet.mock.calls)
    quiet.mockRestore()
    expect(logged).not.toMatch(/jane|Jane Doe/i)
    const r409 = await row(k409)
    expect(r409.sentAt).toBeInstanceOf(Date)
    expect(r409.lastError).toBe('HTTP 409 SUBMISSION_CONFLICT')
    const r422 = await row(k422)
    expect(r422.sentAt).toBeNull()
    expect(r422.attempts).toBe(20)
    expect(r422.lastError).toBe('HTTP 422 INVALID_FIELD')

    await db.update(crmOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(inArray(crmOutbox.eventKey, [k409, k422]))
    const again = fakeFetch(() => json(200))
    await runCrmSync({ fetch: again.fn, env: CONFIG, eventKeyPrefix: PREFIX })
    expect(again.calls).toHaveLength(0)
  })

  it('sends nothing while the switch is off, and nothing (with one warning) when config is missing', async () => {
    const k = await queue('switch')
    const off = fakeFetch(() => json(200))
    expect(await runCrmSync({ fetch: off.fn, env: { ...CONFIG, CRM_SYNC_ENABLED: 'false' }, eventKeyPrefix: PREFIX })).toMatchObject({ skipped: 'disabled' })
    expect(await runCrmSync({ fetch: off.fn, env: {}, eventKeyPrefix: PREFIX })).toMatchObject({ skipped: 'disabled' })
    expect(off.calls).toHaveLength(0)

    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined as never)
    const missing = { CRM_SYNC_ENABLED: 'true', CRM_INTAKE_URL: CONFIG.CRM_INTAKE_URL }
    expect(await runCrmSync({ fetch: off.fn, env: missing, eventKeyPrefix: PREFIX })).toMatchObject({ skipped: 'missing-config' })
    await runCrmSync({ fetch: off.fn, env: missing, eventKeyPrefix: PREFIX })
    const warnings = warn.mock.calls.filter((c) => JSON.stringify(c).includes('POTENTIAL_CRM_INTAKE_KEY'))
    warn.mockRestore()
    expect(warnings).toHaveLength(1)
    expect(JSON.stringify(warnings[0])).toContain('CRM_PROGRAM_ID')
    expect(off.calls).toHaveLength(0)
    expect((await row(k)).attempts).toBe(0)
  })

  it('refuses redirects and plain-http URLs (except localhost)', async () => {
    const k = await queue('redirect')
    const { fn, calls } = fakeFetch(() => json(200))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}redirect` })
    expect(calls[0]!.init.redirect).toBe('error')
    expect((await row(k)).sentAt).toBeInstanceOf(Date)

    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined as never)
    const plain = { ...CONFIG, CRM_INTAKE_URL: 'http://crm.example.test/api/intake' }
    expect(await runCrmSync({ fetch: fn, env: plain, eventKeyPrefix: PREFIX })).toMatchObject({ skipped: 'missing-config' })
    expect(JSON.stringify(warn.mock.calls)).toContain('https')
    warn.mockRestore()
    expect(calls).toHaveLength(1)
    const local = await queue('local-http')
    const localEnv = { ...CONFIG, CRM_INTAKE_URL: 'http://localhost:4010/api/intake' }
    await runCrmSync({ fetch: fn, env: localEnv, eventKeyPrefix: `${PREFIX}local-http` })
    expect((await row(local)).sentAt).toBeInstanceOf(Date)
  })

  it('treats 401, 403 and 404 as a configuration problem: rows untouched, run stopped, one warning', async () => {
    for (const status of [401, 403, 404]) {
      const keys = [await queue(`cfg${status}-a`), await queue(`cfg${status}-b`)]
      const warn = spyOn(logger, 'warn').mockImplementation(() => undefined as never)
      const { fn, calls } = fakeFetch(() => json(status, { code: 'UNAUTHORIZED' }))
      const env = { ...CONFIG, POTENTIAL_CRM_INTAKE_KEY: `key-for-${status}` }
      const first = await runCrmSync({ fetch: fn, env, eventKeyPrefix: `${PREFIX}cfg${status}-` })
      expect(first).toMatchObject({ configError: status, sent: 0, retried: 0, failed: 0 })
      expect(calls).toHaveLength(1)
      for (const k of keys) {
        const r = await row(k)
        expect(r.attempts).toBe(0)
        expect(r.lastError).toBeNull()
        expect(r.sentAt).toBeNull()
        expect(r.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
      }
      // Same config again: still stopped, no second warning.
      await runCrmSync({ fetch: fn, env, eventKeyPrefix: `${PREFIX}cfg${status}-` })
      const warnings = warn.mock.calls.filter((c) => JSON.stringify(c).includes(String(status)))
      warn.mockRestore()
      expect(warnings).toHaveLength(1)
      // Fixed config: the backlog goes out.
      const ok = fakeFetch(() => json(200))
      expect((await runCrmSync({ fetch: ok.fn, env: CONFIG, eventKeyPrefix: `${PREFIX}cfg${status}-` })).sent).toBe(2)
    }
  })

  it('fills in the program id once, before the first send, when it was not set at enqueue time', async () => {
    const eventKey = `${PREFIX}noprog`
    await db.insert(crmOutbox).values({ eventKey, payload: { submissionId: eventKey, programId: null } })
    const { fn, calls } = fakeFetch(() => json(200))
    await runCrmSync({ fetch: fn, env: { ...CONFIG, CRM_COHORT_ID: COHORT_ID }, eventKeyPrefix: `${PREFIX}noprog` })
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ programId: PROGRAM_ID, cohortId: COHORT_ID })
    expect((await row(eventKey)).payload).toMatchObject({ programId: PROGRAM_ID, cohortId: COHORT_ID })
  })

  it('needs UUIDs for the program and cohort ids: otherwise one warning, nothing sent, rows untouched', async () => {
    const k = await queue('uuid')
    const { fn, calls } = fakeFetch(() => json(200))
    for (const [name, env] of [
      ['CRM_PROGRAM_ID', { ...CONFIG, CRM_PROGRAM_ID: 'hadafi-programme' }],
      ['CRM_COHORT_ID', { ...CONFIG, CRM_COHORT_ID: 'cohort-9' }],
    ] as const) {
      const warn = spyOn(logger, 'warn').mockImplementation(() => undefined as never)
      expect(await runCrmSync({ fetch: fn, env, eventKeyPrefix: `${PREFIX}uuid` })).toMatchObject({ skipped: 'missing-config' })
      await runCrmSync({ fetch: fn, env, eventKeyPrefix: `${PREFIX}uuid` })
      const warnings = warn.mock.calls.filter((c) => JSON.stringify(c).includes(name))
      warn.mockRestore()
      expect(warnings).toHaveLength(1)
      expect(JSON.stringify(warnings[0])).toContain('UUID')
    }
    expect(calls).toHaveLength(0)
    const r = await row(k)
    expect([r.attempts, r.lastError, r.sentAt]).toEqual([0, null, null])
    // A valid cohort is fine.
    await runCrmSync({ fetch: fn, env: { ...CONFIG, CRM_COHORT_ID: COHORT_ID }, eventKeyPrefix: `${PREFIX}uuid` })
    expect((await row(k)).sentAt).toBeInstanceOf(Date)
  })

  it('replaces a malformed program id frozen in an unsent payload with the configured one', async () => {
    const eventKey = `${PREFIX}badprog`
    await db.insert(crmOutbox).values({ eventKey, payload: { submissionId: eventKey, programId: 'hadafi-programme', cohortId: 'cohort-9' } })
    const { fn, calls } = fakeFetch(() => json(200))
    await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: eventKey })
    const sent = JSON.parse(String(calls[0]!.init.body))
    expect(sent.programId).toBe(PROGRAM_ID)
    expect(sent.cohortId).toBeUndefined()
  })

  it('two drains running at once never send the same row twice', async () => {
    const keys = await Promise.all(Array.from({ length: 10 }, (_, i) => queue(`par-${i}`)))
    const seen = new Map<string, number>()
    const { fn } = fakeFetch(async (body) => {
      const id = String(body['submissionId'])
      seen.set(id, (seen.get(id) ?? 0) + 1)
      await new Promise((r) => setTimeout(r, 30))
      return json(200)
    })
    await Promise.all([
      runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}par-` }),
      runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}par-` }),
    ])
    expect([...seen.keys()].sort()).toEqual([...keys].sort())
    expect([...seen.values()].every((n) => n === 1)).toBe(true)
  })

  it('caps each run', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => queue(`cap-${i}`)))
    const { fn, calls } = fakeFetch(() => json(200))
    const result = await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `${PREFIX}cap-`, batchSize: 3 })
    expect(calls).toHaveLength(3)
    expect(result.sent).toBe(3)
  })

  it('counts pending, sent and failed rows', async () => {
    const counts = await crmOutboxCounts()
    expect(counts).toEqual(expect.objectContaining({ pending: expect.any(Number), sent: expect.any(Number), failed: expect.any(Number) }))
    expect(counts.failed).toBeGreaterThanOrEqual(2)
  })
})

describe('withdrawing a course completion (certificate taken back)', () => {
  /** A course_completed row for a made-up learner and course (no user row needed: user_id is null). */
  async function queueCompletion(learnerId: string, courseId: string, extra: Partial<typeof crmOutbox.$inferInsert> = {}) {
    const eventKey = crmEventKey.courseCompleted(learnerId, courseId)
    await db.insert(crmOutbox).values({ eventKey, payload: { submissionId: eventKey, programId: PROGRAM_ID }, ...extra })
    return eventKey
  }
  const sentKeys = (calls: Call[]) => calls.map((c) => JSON.parse(String(c.init.body))['submissionId'] as string)
  const learnerIds: string[] = []
  const newLearner = () => {
    const id = crypto.randomUUID()
    learnerIds.push(id)
    return id
  }

  afterAll(async () => {
    for (const id of learnerIds) await db.delete(crmOutbox).where(like(crmOutbox.eventKey, `hadafi:cert:${id}:%`))
  })

  it('deletes an unsent row no drain has claimed', async () => {
    const learner = newLearner()
    const course = crypto.randomUUID()
    const key = await queueCompletion(learner, course)
    await withdrawCourseCompleted(db, learner, course)
    expect(await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, key))).toEqual([])
  })

  it('never touches a row that has been sent', async () => {
    const learner = newLearner()
    const course = crypto.randomUUID()
    const sentAt = new Date(Date.now() - 60_000)
    const key = await queueCompletion(learner, course, { sentAt, attempts: 0 })
    const before = await row(key)
    await withdrawCourseCompleted(db, learner, course)
    expect(await row(key)).toEqual(before)
  })

  it('a row claimed by a running drain but not yet sent is never sent', async () => {
    const learner = newLearner()
    const [c1, c2] = [crypto.randomUUID(), crypto.randomUUID()]
    const k1 = await queueCompletion(learner, c1)
    const k2 = await queueCompletion(learner, c2, { createdAt: new Date(Date.now() + 1_000) })
    // Both rows are claimed in one batch; while the first is being sent, the second is withdrawn.
    const { fn, calls } = fakeFetch(async (body) => {
      if (body['submissionId'] === k1) await withdrawCourseCompleted(db, learner, c2)
      return json(200)
    })
    const result = await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `hadafi:cert:${learner}:` })
    expect(result.claimed).toBe(2)
    expect(sentKeys(calls)).toEqual([k1])
    expect(result.sent).toBe(1)
    expect(await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, k2))).toEqual([])
    expect((await row(k1)).sentAt).toBeInstanceOf(Date)
  })

  it('a withdrawal that arrives mid-send waits for it, then leaves the sent row alone', async () => {
    const learner = newLearner()
    const course = crypto.randomUUID()
    const key = await queueCompletion(learner, course)
    let withdrawal: Promise<void> | undefined
    let withdrawn = false
    let withdrawnBeforeReply: boolean | undefined
    const { fn, calls } = fakeFetch(async () => {
      withdrawal = withdrawCourseCompleted(db, learner, course).then(() => {
        withdrawn = true
      })
      await new Promise((r) => setTimeout(r, 150))
      withdrawnBeforeReply = withdrawn
      return json(200)
    })
    const result = await runCrmSync({ fetch: fn, env: CONFIG, eventKeyPrefix: `hadafi:cert:${learner}:` })
    await withdrawal
    expect(sentKeys(calls)).toEqual([key])
    expect(result.sent).toBe(1)
    // It waited for the send to finish (it can't recall a request already on its way).
    expect(withdrawnBeforeReply).toBe(false)
    expect(withdrawn).toBe(true)
    // The send finished first, so the outbox still records that the CRM has it.
    const r = await row(key)
    expect(r.sentAt).toBeInstanceOf(Date)
    expect(r.lastError).toBeNull()
  })

  it('a row waiting to be retried is withdrawn and never sent', async () => {
    const learner = newLearner()
    const course = crypto.randomUUID()
    const key = await queueCompletion(learner, course, { attempts: 2, lastError: 'HTTP 503', nextAttemptAt: new Date(Date.now() + 120_000) })
    await withdrawCourseCompleted(db, learner, course)
    expect(await db.select().from(crmOutbox).where(eq(crmOutbox.eventKey, key))).toEqual([])
  })
})
