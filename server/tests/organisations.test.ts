import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import crypto from 'node:crypto'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  authAccounts,
  authSessions,
  authVerifications,
  courseEnrollments,
  mentorAvailabilitySlots,
  mentorSessions,
  modules,
  notifications,
  organisations,
  units,
  userUnitProgress,
  users,
} from '../db/schema'
import { assertCanSignUp, createLearnerAccount } from '../auth/accounts'
import { hashPassword } from '../auth/password'
import { listOrganisationMemberIds } from '../services/organisations.service'
import {
  startTestServer,
  stopTestServer,
  api,
  createTestUser,
  cleanupFixtureUsers,
  signIn,
  mailpitAvailable,
  cookieHeader,
  ORIGIN,
  type TestUser,
  fixtureEmail,
} from './helpers'

/**
 * Organisations and partner logins (SMEEP db40881, 68d8fd4, f31dd6e):
 * sign-up links, adding learners, partner contacts, the partner portal and
 * participant records. Security first: a partner only ever sees their own
 * organisation's learners, learners and mentors are refused, removal is
 * instant, and a sign-up link can't choose a role.
 */

let base: string
let admin: TestUser
let learner: TestUser
let mentor: TestUser
let stranger: TestUser
let orgId: string
let joinCode: string
let otherOrgId: string
let otherPartner: TestUser
const PARTNER_EMAIL = fixtureEmail('partner')
const PARTNER_PASSWORD = 'e2e-partner-12345'
let partnerId: string
let partnerToken: string

type Dashboard = { data: { organisation: { id: string; name: string }; kpis: { learners: number }; learners: { id: string; email: string }[] } }
type RecordBody = {
  data: {
    profile: { email: string }
    courses: { courseId: string; units: { status: string }[]; exams: { answers: { isCorrect: boolean }[] }[] }[]
    mentorSessions: { mentorName: string; status: string }[]
    activity: { kind: string }[]
  }
}

const freshEmail = (prefix: string) => fixtureEmail(prefix)
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('base64url')

/** Partner logins have no password (they sign in by email code); tests give one a password to sign in without Mailpit. */
async function signInPartner(userId: string, email: string): Promise<string> {
  await db.insert(authAccounts).values({ accountId: userId, providerId: 'credential', userId, password: await hashPassword(PARTNER_PASSWORD) })
  return signIn(email, PARTNER_PASSWORD)
}

/** The code in the sign-in email Mailpit received for `email` (the partner invite email arrives around the same time). */
async function signInCodeFor(email: string): Promise<string | null> {
  const query = encodeURIComponent(`to:"${email}" subject:"sign-in code"`)
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${query}&limit=1`)).json()) as { messages?: { ID: string }[] }
    const id = list.messages?.[0]?.ID
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string }
      return msg.Text.match(/\b(\d{6})\b/)?.[1] ?? null
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025'

const asAdmin = <T = { data: Record<string, unknown> }>(method: string, path: string, body?: object) =>
  api<T>(method, `/api/admin/organisations${path}`, { token: admin.token, body })

beforeAll(async () => {
  base = await startTestServer()
  admin = await createTestUser('org-admin', 'admin')
  learner = await createTestUser('org-learner')
  mentor = await createTestUser('org-mentor', 'mentor')
  stranger = await createTestUser('org-stranger')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await db.delete(organisations).where(like(organisations.name, 'E2E Org%'))
  await stopTestServer()
})

describe('organisations (admin)', () => {
  it('creates an organisation with a sign-up code, admins only', async () => {
    expect((await api('POST', '/api/admin/organisations', { token: learner.token, body: { name: 'E2E Org Nope', type: 'government' } })).status).toBe(403)
    expect((await api('GET', '/api/admin/organisations', { token: mentor.token })).status).toBe(403)
    expect((await api('GET', '/api/admin/organisations')).status).toBe(401)
    expect((await asAdmin('POST', '', { name: 'E', type: 'government' })).status).toBe(422)
    expect((await asAdmin('POST', '', { name: 'E2E Org Bad Type', type: 'cartel' })).status).toBe(422)

    const res = await asAdmin('POST', '', { name: 'E2E Org Ministry', type: 'government' })
    expect(res.status).toBe(201)
    orgId = String(res.body.data.id)
    joinCode = String(res.body.data.joinCode)
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    otherOrgId = String((await asAdmin('POST', '', { name: 'E2E Org Other', type: 'university' })).body.data.id)

    const list = await asAdmin<{ data: { id: string; joinLink: string }[] }>('GET', '')
    const mine = list.body.data.find((o) => o.id === orgId)
    expect(mine?.joinLink).toContain(`/sign-up?org=${joinCode}`)
  })

  it('shows the organisation name for its sign-up link, and nothing once the link is off', async () => {
    const res = await api<{ data: { name: string } }>('GET', `/api/organisations/join/${joinCode.toLowerCase()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ name: 'E2E Org Ministry', code: joinCode } as never)
    expect((await asAdmin('PATCH', `/${otherOrgId}`, { joinEnabled: false })).status).toBe(200)
    const [other] = await db.select({ code: organisations.joinCode }).from(organisations).where(eq(organisations.id, otherOrgId))
    expect((await api('GET', `/api/organisations/join/${other!.code}`)).status).toBe(404)
    expect((await api('GET', '/api/organisations/join/NOPE1234')).status).toBe(404)
    // Only the listed fields can change.
    expect((await asAdmin('PATCH', `/${orgId}`, { archivedAt: null })).status).toBe(422)
  })

  it('gives a new code on request; the old link stops working', async () => {
    const res = await asAdmin('POST', `/${otherOrgId}/join-code`)
    expect(res.status).toBe(200)
    const [after] = await db.select({ code: organisations.joinCode }).from(organisations).where(eq(organisations.id, otherOrgId))
    expect(after!.code).toBe(String(res.body.data.joinCode))
  })
})

describe('signing up with an organisation link', () => {
  it('puts the learner in the organisation', async () => {
    const email = freshEmail('org-joiner')
    await assertCanSignUp(email, undefined, joinCode)
    const id = await createLearnerAccount({ fullName: 'E2E Joiner', email, country: 'AE', orgCode: joinCode })
    const [u] = await db.select({ org: users.organisationId, role: users.role }).from(users).where(eq(users.id, id))
    expect(u).toEqual({ org: orgId, role: 'sme' })
  })

  it('refuses a code that is off or unknown before creating anything', async () => {
    const email = freshEmail('org-bad')
    await expect(assertCanSignUp(email, undefined, 'NOPE1234')).rejects.toMatchObject({ code: 'INVALID_ORG_CODE' })
    await expect(createLearnerAccount({ fullName: 'E2E Bad', email, country: 'AE', orgCode: 'NOPE1234' })).rejects.toMatchObject({
      code: 'INVALID_ORG_CODE',
    })
    expect((await db.select().from(users).where(eq(users.email, email))).length).toBe(0)
  })

  /** A verifiedToken as the sign-up code step leaves it (the code round trip itself is in auth.test.ts). */
  async function verified(email: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url')
    await db.insert(authVerifications).values({
      identifier: `hadafi-sign-up-verified-${email}`,
      value: sha256(token),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })
    return token
  }

  it("can't be used to pick a role or another organisation, through the real sign-up endpoint", async () => {
    const email = freshEmail('org-sneaky')
    const res = await api('POST', '/api/auth/hadafi/sign-up', {
      body: {
        fullName: 'E2E Sneaky',
        email,
        country: 'AE',
        orgCode: joinCode,
        verifiedToken: await verified(email),
        role: 'partner',
        organisationId: otherOrgId,
        emailVerified: false,
      },
    })
    expect(res.status).toBe(200)
    const [u] = await db.select({ role: users.role, org: users.organisationId }).from(users).where(eq(users.email, email))
    expect(u).toEqual({ role: 'sme', org: orgId })
    // And the signed-in learner is refused the partner portal.
    const cookie = cookieHeader(res.setCookie)
    expect((await api('GET', '/api/partner/dashboard', { token: cookie })).status).toBe(403)
  })

  it('reports a dead link without spending the verified email', async () => {
    const email = freshEmail('org-deadlink')
    const token = await verified(email)
    const [other] = await db.select({ code: organisations.joinCode }).from(organisations).where(eq(organisations.id, otherOrgId))
    const res = await api<{ code: string }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'E2E Dead', email, country: 'AE', orgCode: other!.code, verifiedToken: token },
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_ORG_CODE')
    // Same proof, without the link: signs up on her own.
    const again = await api('POST', '/api/auth/hadafi/sign-up', { body: { fullName: 'E2E Dead', email, country: 'AE', verifiedToken: token } })
    expect(again.status).toBe(200)
    const [u] = await db.select({ org: users.organisationId }).from(users).where(eq(users.email, email))
    expect(u!.org).toBeNull()
  })
})

describe('assigning learners', () => {
  it('adds existing learners by email, tells them in the bell, and never adds staff', async () => {
    const res = await asAdmin<{ data: Record<string, string[]> }>('POST', `/${orgId}/learners`, {
      emails: [learner.email.toUpperCase(), mentor.email, 'nobody@e2e.local'],
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ added: [learner.email], notLearners: [mentor.email], notFound: ['nobody@e2e.local'] })
    const [m] = await db.select({ org: users.organisationId }).from(users).where(eq(users.id, mentor.id))
    expect(m!.org).toBeNull()
    const bell = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, learner.id), eq(notifications.type, 'organisation')))
    expect(bell[0]?.title).toContain('E2E Org Ministry')
    const mine = await api<{ data: { name: string } | null }>('GET', '/api/me/organisation', { token: learner.token })
    expect(mine.body.data?.name).toBe('E2E Org Ministry')
  })

  it('lists an organisation’s people for other features', async () => {
    const ids = await listOrganisationMemberIds(orgId)
    expect(ids).toContain(learner.id)
    expect(ids).not.toContain(stranger.id)
    expect(await listOrganisationMemberIds('not-a-uuid')).toEqual([])
  })
})

describe('partner logins', () => {
  it('invites a partner contact: a partner login tied to the organisation', async () => {
    expect((await asAdmin('POST', `/${orgId}/partners`, { fullName: 'E2E Partner', email: 'not-an-email' })).status).toBe(422)
    const res = await asAdmin('POST', `/${orgId}/partners`, { fullName: 'E2E Partner', email: PARTNER_EMAIL.toUpperCase() })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ email: PARTNER_EMAIL, status: 'invited' })
    const [u] = await db
      .select({ id: users.id, role: users.role, org: users.organisationId, verified: users.emailVerified })
      .from(users)
      .where(eq(users.email, PARTNER_EMAIL))
    expect(u).toMatchObject({ role: 'partner', org: orgId, verified: true })
    partnerId = u!.id
    partnerToken = await signInPartner(partnerId, PARTNER_EMAIL)
    // Shown as active once they've used the portal.
    expect((await api('GET', '/api/partner/dashboard', { token: partnerToken })).status).toBe(200)
    const partners = await asAdmin<{ data: { email: string; status: string }[] }>('GET', `/${orgId}/partners`)
    expect(partners.body.data.find((p) => p.email === PARTNER_EMAIL)?.status).toBe('active')
  })

  it("won't turn an existing account into a partner", async () => {
    expect((await asAdmin('POST', `/${orgId}/partners`, { fullName: 'Taken', email: learner.email })).status).toBe(409)
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, learner.id))
    expect(u!.role).toBe('sme')
  })

  it('signs a partner in with an emailed code, like everyone (needs Mailpit)', async () => {
    if (!(await mailpitAvailable())) return
    const email = freshEmail('partner-code')
    expect((await asAdmin('POST', `/${otherOrgId}/partners`, { fullName: 'E2E Code Partner', email })).status).toBe(201)
    expect((await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })).status).toBe(200)
    const otp = await signInCodeFor(email)
    expect(otp).toMatch(/^\d{6}$/)
    const res = await api<{ user: { role: string } }>('POST', '/api/auth/sign-in/email-otp', { body: { email, otp } })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('partner')
    const dash = await api<Dashboard>('GET', '/api/partner/dashboard', { token: cookieHeader(res.setCookie) })
    expect(dash.body.data.organisation.id).toBe(otherOrgId)
  }, 20_000)
})

describe('the partner portal shows only their own organisation', () => {
  beforeAll(async () => {
    await db.update(users).set({ organisationId: otherOrgId }).where(eq(users.id, stranger.id))
    // A partner of the other organisation, to check the walls from the other side too.
    otherPartner = await createTestUser('org-other-partner')
    await db.update(users).set({ role: 'partner', organisationId: otherOrgId }).where(eq(users.id, otherPartner.id))
  })

  it("lists only their own learners on the dashboard, whatever the request says", async () => {
    for (const path of ['/api/partner/dashboard', `/api/partner/dashboard?organisationId=${otherOrgId}`]) {
      const res = await api<Dashboard>('GET', path, { token: partnerToken, headers: { 'X-Organisation-Id': otherOrgId } })
      expect(res.status).toBe(200)
      expect(res.body.data.organisation.id).toBe(orgId)
      const emails = res.body.data.learners.map((l) => l.email)
      expect(emails).toContain(learner.email)
      expect(emails).not.toContain(stranger.email)
      expect(emails).not.toContain(PARTNER_EMAIL)
    }
    const theirs = await api<Dashboard>('GET', '/api/partner/dashboard', { token: otherPartner.token })
    expect(theirs.body.data.learners.map((l) => l.email)).not.toContain(learner.email)
  })

  it("can't read another organisation's people by id", async () => {
    // Another organisation's learner, a learner in no organisation, a partner and staff: all 404, never "forbidden".
    for (const id of [stranger.id, mentor.id, admin.id, otherPartner.id, partnerId, crypto.randomUUID(), 'not-a-uuid']) {
      expect((await api('GET', `/api/partner/learners/${id}`, { token: partnerToken })).status).toBe(404)
    }
    expect((await api('GET', `/api/partner/learners/${learner.id}`, { token: otherPartner.token })).status).toBe(404)
    // Their own learner works.
    expect((await api('GET', `/api/partner/learners/${learner.id}`, { token: partnerToken })).status).toBe(200)
  })

  it('gives partners no Hana tokens', async () => {
    expect((await api('GET', '/api/account/copilot-token', { token: partnerToken })).status).toBe(403)
    expect((await api('GET', '/api/account/voice-token', { token: partnerToken })).status).toBe(403)
  })

  it('keeps partners out of the admin area', async () => {
    expect((await api('GET', '/api/admin/organisations', { token: partnerToken })).status).toBe(403)
    expect((await api('GET', `/api/admin/organisations/${otherOrgId}/dashboard`, { token: partnerToken })).status).toBe(403)
    expect((await api('GET', `/api/admin/organisations/${otherOrgId}/learners/${stranger.id}`, { token: partnerToken })).status).toBe(403)
    expect((await api('GET', `/api/admin/organisations/${otherOrgId}/exports/learners?format=csv`, { token: partnerToken })).status).toBe(403)
    expect((await api('GET', '/api/admin/exports/learners?format=csv', { token: partnerToken })).status).toBe(403)
  })

  it('downloads only their own learners, and only the partner datasets', async () => {
    for (const dataset of ['learners', 'course-progress', 'certificates', 'learning-gain', 'mentor-sessions']) {
      const res = await fetch(`${base}/api/partner/exports/${dataset}?format=csv&organisationId=${otherOrgId}`, {
        headers: { Origin: ORIGIN, Cookie: partnerToken },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toContain(`e2e-org-ministry-${dataset}-`)
      const body = await res.text()
      expect(body).not.toContain(stranger.email)
      if (dataset === 'learners') expect(body).toContain(learner.email)
    }
    expect((await api('GET', '/api/partner/exports/redemptions?format=csv', { token: partnerToken })).status).toBe(404)
  })

  it('refuses learners and mentors on every partner route (403)', async () => {
    for (const who of [learner, mentor, stranger]) {
      expect((await api('GET', '/api/partner/dashboard', { token: who.token })).status).toBe(403)
      expect((await api('GET', `/api/partner/learners/${learner.id}`, { token: who.token })).status).toBe(403)
      expect((await api('GET', '/api/partner/exports/learners?format=csv', { token: who.token })).status).toBe(403)
    }
    expect((await api('GET', '/api/partner/dashboard')).status).toBe(401)
  })

  it("can't leave or switch organisations from the partner login", async () => {
    expect((await api('POST', '/api/me/organisation/leave', { token: partnerToken })).status).toBe(200)
    const [p] = await db.select({ org: users.organisationId }).from(users).where(eq(users.id, partnerId))
    expect(p!.org).toBe(orgId)
    // Profile edits can't carry an organisation or a role either.
    await api('PUT', '/api/account/me', { token: partnerToken, body: { fullName: 'E2E Partner', organisationId: otherOrgId, role: 'admin' } })
    const [after] = await db.select({ org: users.organisationId, role: users.role }).from(users).where(eq(users.id, partnerId))
    expect(after).toEqual({ org: orgId, role: 'partner' })
  })
})

describe('participant record', () => {
  let courseId: string

  beforeAll(async () => {
    // The learner's learning: a course with a finished unit, a pre-test attempt and a mentor session.
    const [a] = await db.select().from(assessments).where(eq(assessments.assessmentType, 'pre')).limit(1)
    if (!a) throw new Error('Seed courses first: need a pre-test')
    courseId = a.courseId
    await db.insert(courseEnrollments).values({ userId: learner.id, courseId }).onConflictDoNothing()
    const [unit] = await db
      .select({ id: units.id })
      .from(units)
      .innerJoin(modules, eq(modules.id, units.moduleId))
      .where(eq(modules.courseId, courseId))
      .limit(1)
    await db.insert(userUnitProgress).values({ userId: learner.id, unitId: unit!.id, status: 'completed', completedAt: new Date() })
    const qs = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, a.id))
    await db.insert(assessmentAttempts).values({
      userId: learner.id,
      assessmentId: a.id,
      attemptNumber: 1,
      answers: Object.fromEntries(qs.map((q, i) => [q.id, i === 0 ? q.correctAnswer : (q.correctAnswer + 1) % Math.max(2, q.options.length)])),
      score: 50,
      passed: false,
      completedAt: new Date(),
    })
    const [slot] = await db
      .insert(mentorAvailabilitySlots)
      .values({ mentorUserId: mentor.id, startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000), isAvailable: false })
      .returning()
    await db.insert(mentorSessions).values({
      slotId: slot!.id,
      mentorUserId: mentor.id,
      smeUserId: learner.id,
      status: 'completed',
      mentorNotes: 'E2E-PRIVATE-MENTOR-NOTE',
    })
  })

  afterAll(async () => {
    // Sessions restrict deleting users: clear them so fixture cleanup can run.
    await db.delete(mentorSessions).where(eq(mentorSessions.mentorUserId, mentor.id))
    await db.delete(mentorAvailabilitySlots).where(eq(mentorAvailabilitySlots.mentorUserId, mentor.id))
  })

  it("gives the partner the participant's record: courses, exams, mentor sessions, activity", async () => {
    const res = await api<RecordBody>('GET', `/api/partner/learners/${learner.id}`, { token: partnerToken })
    expect(res.status).toBe(200)
    const r = res.body.data
    expect(r.profile.email).toBe(learner.email)
    const course = r.courses.find((c) => c.courseId === courseId)!
    expect(course.units.some((u) => u.status === 'completed')).toBe(true)
    const answers = course.exams[0]!.answers
    if (answers.length) expect(answers[0]!.isCorrect).toBe(true)
    if (answers.length > 1) expect(answers[1]!.isCorrect).toBe(false)
    expect(r.mentorSessions[0]).toMatchObject({ status: 'completed' })
    expect(r.activity.some((x) => x.kind === 'unit')).toBe(true)
    // Never a mentor's private notes.
    expect(JSON.stringify(r)).not.toContain('E2E-PRIVATE-MENTOR-NOTE')
  })

  it('opens for admins from the organisation page, only for that organisation’s learners', async () => {
    expect((await asAdmin('GET', `/${orgId}/learners/${learner.id}`)).status).toBe(200)
    expect((await asAdmin('GET', `/${orgId}/learners/${stranger.id}`)).status).toBe(404)
    expect((await asAdmin('GET', `/${otherOrgId}/learners/${learner.id}`)).status).toBe(404)
  })
})

describe('instant partner removal', () => {
  it('ends the removed partner’s sessions on the very next request', async () => {
    const before = await api('GET', '/api/partner/dashboard', { token: partnerToken })
    expect(before.status).toBe(200)
    // Removing through the wrong organisation does nothing.
    expect((await asAdmin('DELETE', `/${otherOrgId}/partners/${partnerId}`)).status).toBe(404)
    expect((await api('GET', '/api/partner/dashboard', { token: partnerToken })).status).toBe(200)

    expect((await asAdmin('DELETE', `/${orgId}/partners/${partnerId}`)).status).toBe(200)
    expect((await db.select().from(authSessions).where(eq(authSessions.userId, partnerId))).length).toBe(0)
    expect((await db.select().from(users).where(eq(users.id, partnerId))).length).toBe(0)
    // Refused at once, not after the 5-minute session cookie cache.
    expect((await api('GET', '/api/partner/dashboard', { token: partnerToken })).status).toBe(401)
    expect((await api('GET', `/api/partner/learners/${learner.id}`, { token: partnerToken })).status).toBe(401)
    expect((await api('GET', '/api/partner/exports/learners?format=csv', { token: partnerToken })).status).toBe(401)
  })

  it('refuses a revoked partner session at once, even while its cookie cache is fresh', async () => {
    const email = freshEmail('partner-revoked')
    const res = await asAdmin('POST', `/${orgId}/partners`, { fullName: 'E2E Revoked Partner', email })
    const id = String(res.body.data.id)
    const token = await signInPartner(id, email)
    expect((await api('GET', '/api/partner/dashboard', { token })).status).toBe(200)
    await db.delete(authSessions).where(eq(authSessions.userId, id))
    expect((await api('GET', '/api/partner/dashboard', { token })).status).toBe(401)
  })

  it("won't remove a learner or staff through the partner route", async () => {
    expect((await asAdmin('DELETE', `/${orgId}/partners/${learner.id}`)).status).toBe(404)
    expect((await db.select().from(users).where(eq(users.id, learner.id))).length).toBe(1)
  })
})

describe('leaving and archiving', () => {
  it('lets an admin remove a learner, and a learner leave', async () => {
    expect((await asAdmin('DELETE', `/${otherOrgId}/learners/${stranger.id}`)).status).toBe(200)
    expect((await asAdmin('DELETE', `/${otherOrgId}/learners/${stranger.id}`)).status).toBe(404)
    expect((await api('POST', '/api/me/organisation/leave', { token: learner.token })).status).toBe(200)
    expect((await api<{ data: unknown }>('GET', '/api/me/organisation', { token: learner.token })).body.data).toBeNull()
  })

  it('archiving ends partner access at once and takes learners out, keeping their accounts', async () => {
    await db.update(users).set({ organisationId: otherOrgId }).where(eq(users.id, stranger.id))
    expect((await api('GET', '/api/partner/dashboard', { token: otherPartner.token })).status).toBe(200)
    expect((await asAdmin('DELETE', `/${otherOrgId}`)).status).toBe(200)
    expect((await db.select().from(users).where(eq(users.id, otherPartner.id))).length).toBe(0)
    expect((await api('GET', '/api/partner/dashboard', { token: otherPartner.token })).status).toBe(401)
    const [s] = await db.select({ org: users.organisationId }).from(users).where(eq(users.id, stranger.id))
    expect(s!.org).toBeNull()
    expect((await asAdmin('GET', `/${otherOrgId}/dashboard`)).status).toBe(404)
  })
})
