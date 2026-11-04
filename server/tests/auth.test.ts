import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { eq, like } from 'drizzle-orm'
import { db } from '../db'
import { authAccounts, authRateLimits, inviteCodes, mentorRegistrations, mentorSetupTokens, users } from '../db/schema'
import { createLearnerAccount } from '../auth/accounts'
import { hashPassword } from '../auth/password'
import {
  startTestServer,
  stopTestServer,
  api,
  cookieHeader,
  createTestUser,
  cleanupFixtureUsers,
  mailpitAvailable,
  fetchOtpFromMailpit,
  signIn,
  type TestUser,
  fixtureEmail,
} from './helpers'

/**
 * Better Auth sign-in for Hadafi (server/auth): sign-up proves the email
 * before the account exists, sign-in by email code or password, forgot
 * password by code, accounts from before Better Auth, sessions, roles, and
 * the per-email budgets. The email round trips need Mailpit and skip without it.
 */

let user: TestUser
let hasMailpit = false

beforeAll(async () => {
  await startTestServer()
  user = await createTestUser('auth')
  hasMailpit = await mailpitAvailable()
  if (!hasMailpit) console.warn('[auth.test] Mailpit not reachable on :8025 — email-code tests are skipped')
})

afterEach(() => {
  delete process.env['HADAFI_EMAIL_LIMITS']
})

afterAll(async () => {
  await db.delete(authRateLimits).where(like(authRateLimits.key, 'hadafi-email:%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const freshEmail = (prefix: string) => fixtureEmail(prefix)
const SESSION = 'hadafi.session_token='

/** Sends a sign-up code and swaps it for a verifiedToken (needs Mailpit). */
async function proveEmail(email: string): Promise<string> {
  const since = Date.now()
  expect((await api('POST', '/api/auth/hadafi/sign-up/send-code', { body: { email } })).status).toBe(200)
  const code = await fetchOtpFromMailpit(email, since)
  expect(code).toMatch(/^\d{6}$/)
  const res = await api<{ verifiedToken: string }>('POST', '/api/auth/hadafi/sign-up/verify-code', { body: { email, code } })
  expect(res.status).toBe(200)
  return res.body.verifiedToken
}

/** Emails a sign-in code and signs in with it; returns the session cookie (needs Mailpit). */
async function signInByCode(email: string): Promise<{ status: number; cookie: string }> {
  const since = Date.now()
  expect((await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })).status).toBe(200)
  const otp = await fetchOtpFromMailpit(email, since)
  expect(otp).toMatch(/^\d{6}$/)
  const res = await api('POST', '/api/auth/sign-in/email-otp', { body: { email, otp } })
  return { status: res.status, cookie: cookieHeader(res.setCookie) }
}

/** An account as it looks after migration 0022: legacy, unverified, with its old bcrypt password. */
async function legacyUser(prefix: string, password: string): Promise<string> {
  const email = freshEmail(prefix)
  const [row] = await db
    .insert(users)
    .values({ fullName: `Legacy ${prefix}`, email, role: 'sme', legacyAccount: true, emailVerified: false })
    .returning({ id: users.id })
  await db.insert(authAccounts).values({
    accountId: row!.id,
    providerId: 'credential',
    userId: row!.id,
    password: await hashPassword(password),
  })
  return email
}

describe('sign-up (email code first)', () => {
  it('refuses to create an account without a proven email', async () => {
    const res = await api<{ code: string }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'No Proof', email: freshEmail('noproof'), country: 'AE', password: 'e2e-pass-12345', verifiedToken: 'forged' },
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('creates a verified account and signs in after the code', async () => {
    if (!hasMailpit) return
    const email = freshEmail('signup')
    const verifiedToken = await proveEmail(email)
    const res = await api<{ user: { email: string; role: string; emailVerified: boolean } }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'Sign Up', email, country: 'Jordan', password: 'e2e-pass-12345', verifiedToken },
    })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email, role: 'sme', emailVerified: true })
    const me = await api<{ data: { user: { hasPassword: boolean; country: string } } }>('GET', '/api/account/me', {
      token: cookieHeader(res.setCookie),
    })
    expect(me.status).toBe(200)
    expect(me.body.data.user).toMatchObject({ hasPassword: true, country: 'Jordan' })

    // The verified token is single-use.
    const again = await api('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'Again', email: freshEmail('again'), country: 'AE', verifiedToken },
    })
    expect(again.status).toBe(400)
  })

  it('creates an account without a password (Hana chat sign-up), which then signs in by code', async () => {
    if (!hasMailpit) return
    const email = freshEmail('nopass')
    const verifiedToken = await proveEmail(email)
    const res = await api('POST', '/api/auth/hadafi/sign-up', { body: { fullName: 'No Password', email, country: 'AE', verifiedToken } })
    expect(res.status).toBe(200)
    const me = await api<{ data: { user: { hasPassword: boolean } } }>('GET', '/api/account/me', { token: cookieHeader(res.setCookie) })
    expect(me.body.data.user.hasPassword).toBe(false)
    expect((await signInByCode(email)).status).toBe(200)
  })

  it('reports email availability truthfully, from the body', async () => {
    const taken = await api<{ data: { available: boolean } }>('POST', '/api/account/check-email', { body: { email: user.email } })
    expect(taken.body.data.available).toBe(false)
    const free = await api<{ data: { available: boolean } }>('POST', '/api/account/check-email', { body: { email: freshEmail('free') } })
    expect(free.body.data.available).toBe(true)
  })

  it('redeems an invite code once, and a used code does not cost the verified email', async () => {
    if (!hasMailpit) return
    const code = `E2E-${crypto.randomUUID().slice(0, 8)}`
    const [invite] = await db.insert(inviteCodes).values({ code, status: 'active' }).returning({ id: inviteCodes.id })

    const first = freshEmail('coupon-a')
    const res = await api('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'Coupon A', email: first, country: 'AE', couponCode: code, verifiedToken: await proveEmail(first) },
    })
    expect(res.status).toBe(200)
    const [used] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite!.id))
    expect(used!.status).toBe('used')

    // Same code again: refused, but the verified token is still good.
    const second = freshEmail('coupon-b')
    const token = await proveEmail(second)
    const refused = await api<{ code: string }>('POST', '/api/auth/hadafi/sign-up', {
      body: { fullName: 'Coupon B', email: second, country: 'AE', couponCode: code, verifiedToken: token },
    })
    expect(refused.status).toBe(400)
    expect(refused.body.code).toBe('INVALID_COUPON')
    const retry = await api('POST', '/api/auth/hadafi/sign-up', { body: { fullName: 'Coupon B', email: second, country: 'AE', verifiedToken: token } })
    expect(retry.status).toBe(200)
    await db.delete(inviteCodes).where(eq(inviteCodes.id, invite!.id))
  })

  it('locks a sign-up code after five wrong tries', async () => {
    if (!hasMailpit) return
    const email = freshEmail('lockout')
    const since = Date.now()
    await api('POST', '/api/auth/hadafi/sign-up/send-code', { body: { email } })
    const real = await fetchOtpFromMailpit(email, since)
    const wrong = real === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) {
      expect((await api('POST', '/api/auth/hadafi/sign-up/verify-code', { body: { email, code: wrong } })).status).toBe(400)
    }
    const locked = await api<{ code: string }>('POST', '/api/auth/hadafi/sign-up/verify-code', { body: { email, code: real } })
    expect(locked.status).toBe(429)
    expect(locked.body.code).toBe('OTP_LOCKED')
  })
})

describe('sign-in', () => {
  it('signs in with the right password', async () => {
    expect(await signIn(user.email, user.password)).toContain(SESSION)
  })

  it('rejects a wrong password and an unknown email the same way', async () => {
    const wrong = await api<{ code: string }>('POST', '/api/auth/sign-in/email', { body: { email: user.email, password: 'not-the-password' } })
    const unknown = await api<{ code: string }>('POST', '/api/auth/sign-in/email', { body: { email: freshEmail('ghost'), password: 'not-the-password' } })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.code).toBe(unknown.body.code)
  })

  it('signs in with an emailed code', async () => {
    if (!hasMailpit) return
    const fresh = await createTestUser('code-in')
    const { status, cookie } = await signInByCode(fresh.email)
    expect(status).toBe(200)
    expect(cookie).toContain(SESSION)
    expect((await api('GET', '/api/account/me', { token: cookie })).status).toBe(200)
  })

  it('sends no sign-in code to an unknown email but answers the same', async () => {
    if (!hasMailpit) return
    const email = freshEmail('nobody')
    const since = Date.now()
    const res = await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })
    expect(res.status).toBe(200)
    expect(await fetchOtpFromMailpit(email, since, 4)).toBeNull()
  })

  it('signs admins and mentors in the same way', async () => {
    const admin = await createTestUser('admin-in', 'admin')
    const mentor = await createTestUser('mentor-in', 'mentor')
    expect((await api('GET', '/api/admin/needs-attention', { token: admin.token })).status).toBe(200)
    expect((await api('GET', '/api/mentor/analytics', { token: mentor.token })).status).toBe(200)
  })

  it('no longer has the old 12-hour token endpoints', async () => {
    for (const path of ['/api/auth/login', '/api/auth/register']) {
      expect((await api('POST', path, { body: { email: user.email, password: user.password } })).status).toBe(404)
    }
  })
})

describe('forgot password', () => {
  it('resets a forgotten password with a code', async () => {
    if (!hasMailpit) return
    const fresh = await createTestUser('reset')
    const since = Date.now()
    expect((await api('POST', '/api/auth/email-otp/request-password-reset', { body: { email: fresh.email } })).status).toBe(200)
    const code = await fetchOtpFromMailpit(fresh.email, since)
    const reset = await api('POST', '/api/auth/email-otp/reset-password', {
      body: { email: fresh.email, otp: code, password: 'reset-pass-456' },
    })
    expect(reset.status).toBe(200)
    expect(await signIn(fresh.email, 'reset-pass-456')).toContain(SESSION)
    expect((await api('POST', '/api/auth/sign-in/email', { body: { email: fresh.email, password: fresh.password } })).status).toBe(401)
  })
})

describe('session', () => {
  it('GET /api/account/me works with a session and not without one', async () => {
    expect((await api('GET', '/api/account/me', { token: user.token })).status).toBe(200)
    expect((await api('GET', '/api/account/me')).status).toBe(401)
    expect((await api('GET', '/api/account/me', { token: `${SESSION}garbage` })).status).toBe(401)
    // A bearer token (the old way) is not a session.
    expect((await api('GET', '/api/account/me', { headers: { Authorization: 'Bearer abc.def.ghi' } })).status).toBe(401)
  })

  it('signing out ends the session on the server', async () => {
    const cookie = await signIn(user.email, user.password)
    expect((await api('POST', '/api/auth/sign-out', { token: cookie, body: {} })).status).toBe(200)
    // The cookie cache would keep a stale copy for a few minutes; send only
    // the session token so the server must look the session up.
    const tokenOnly = cookie.split('; ').filter((c) => c.startsWith(SESSION)).join('; ')
    expect((await api('GET', '/api/account/me', { token: tokenOnly })).status).toBe(401)
  })

  it('takes a role change on the next request, cookie cache or not', async () => {
    const person = await createTestUser('role-change')
    expect((await api('GET', '/api/admin/needs-attention', { token: person.token })).status).toBe(403)
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, person.id))
    expect((await api('GET', '/api/admin/needs-attention', { token: person.token })).status).toBe(200)
    // Demotion: the same (cached) session loses admin at once.
    await db.update(users).set({ role: 'sme' }).where(eq(users.id, person.id))
    expect((await api('GET', '/api/admin/needs-attention', { token: person.token })).status).toBe(403)
  })
})

describe('accounts created before Better Auth', () => {
  it('holds a password sign-in until the email is verified by code, then keeps the password', async () => {
    if (!hasMailpit) return
    const email = await legacyUser('legacy-pw', 'legacy-pass-123')
    const since = Date.now()
    const held = await api<{ code: string }>('POST', '/api/auth/sign-in/email', { body: { email, password: 'legacy-pass-123' } })
    expect(held.status).toBe(403)
    expect(held.body.code).toBe('EMAIL_NOT_VERIFIED')
    const code = await fetchOtpFromMailpit(email, since)
    const verified = await api('POST', '/api/auth/email-otp/verify-email', { body: { email, otp: code } })
    expect(verified.status).toBe(200)
    expect(await signIn(email, 'legacy-pass-123')).toContain(SESSION)
  })

  it('keeps the password when the first sign-in is by email code', async () => {
    if (!hasMailpit) return
    const email = await legacyUser('legacy-code', 'legacy-pass-123')
    expect((await signInByCode(email)).status).toBe(200)
    const [row] = await db.select({ verified: users.emailVerified }).from(users).where(eq(users.email, email))
    expect(row!.verified).toBe(true)
    // Without the legacy hook Better Auth would have deleted this password.
    expect(await signIn(email, 'legacy-pass-123')).toContain(SESSION)
  })
})

describe('mentor setup link', () => {
  it('validates the link, creates a verified mentor, signs in, and cannot be reused', async () => {
    const email = freshEmail('mentor-setup')
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const [reg] = await db
      .insert(mentorRegistrations)
      .values({ name: 'Setup Mentor', email, status: 'approved' })
      .returning({ id: mentorRegistrations.id })
    await db.insert(mentorSetupTokens).values({ mentorRegistrationId: reg!.id, token, expiresAt: new Date(Date.now() + 3_600_000) })

    const info = await api<{ name: string; email: string }>('GET', `/api/mentor/setup-token?token=${token}`)
    expect(info.body).toMatchObject({ name: 'Setup Mentor', email })

    const res = await api<{ user: { role: string; emailVerified: boolean } }>('POST', '/api/auth/hadafi/mentor-setup', {
      body: { token, password: 'mentor-pass-123' },
    })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ role: 'mentor', emailVerified: true })
    expect((await api('GET', '/api/mentor/analytics', { token: cookieHeader(res.setCookie) })).status).toBe(200)
    const [linked] = await db.select().from(mentorRegistrations).where(eq(mentorRegistrations.id, reg!.id))
    expect(linked!.userId).toBeTruthy()
    expect(await signIn(email, 'mentor-pass-123')).toContain(SESSION)

    const again = await api<{ code: string }>('POST', '/api/auth/hadafi/mentor-setup', { body: { token, password: 'mentor-pass-123' } })
    expect(again.status).toBe(400)
    expect(again.body.code).toBe('TOKEN_EXPIRED')
    await db.delete(mentorRegistrations).where(eq(mentorRegistrations.id, reg!.id))
  })
})

describe('passwords', () => {
  it('lets an account created without a password set one in Profile, once', async () => {
    if (!hasMailpit) return
    const email = freshEmail('set-pw')
    await createLearnerAccount({ fullName: 'Set Password', email, country: 'AE' })
    const { cookie } = await signInByCode(email)
    const set = await api('POST', '/api/account/set-password', { token: cookie, body: { password: 'first-pass-123', confirm: 'first-pass-123' } })
    expect(set.status).toBe(200)
    expect(await signIn(email, 'first-pass-123')).toContain(SESSION)
    const again = await api<{ error: { code: string } }>('POST', '/api/account/set-password', {
      token: cookie,
      body: { password: 'second-pass-123', confirm: 'second-pass-123' },
    })
    expect(again.body.error.code).toBe('PASSWORD_ALREADY_SET')
  })

  it('changes a password only with the current one', async () => {
    const fresh = await createTestUser('change-pw')
    const wrong = await api<{ code: string }>('POST', '/api/auth/change-password', {
      token: fresh.token,
      body: { currentPassword: 'not-it-123', newPassword: 'changed-pass-123' },
    })
    expect(wrong.status).toBe(400)
    expect(wrong.body.code).toBe('INVALID_PASSWORD')
    const ok = await api('POST', '/api/auth/change-password', {
      token: fresh.token,
      body: { currentPassword: fresh.password, newPassword: 'changed-pass-123' },
    })
    expect(ok.status).toBe(200)
    expect(await signIn(fresh.email, 'changed-pass-123')).toContain(SESSION)
    expect((await api('POST', '/api/auth/sign-in/email', { body: { email: fresh.email, password: fresh.password } })).status).toBe(401)
  })
})

describe('switched-off endpoints', () => {
  it('does not expose Better Auth profile, open sign-up or link-reset endpoints', async () => {
    for (const path of ['/api/auth/update-user', '/api/auth/change-email', '/api/auth/delete-user', '/api/auth/request-password-reset']) {
      const res = await api('POST', path, { token: user.token, body: { name: 'Hacked' } })
      expect(res.status).toBe(404)
    }
    const open = await api('POST', '/api/auth/sign-up/email', {
      body: { name: 'Open', email: freshEmail('open'), password: 'e2e-pass-12345' },
    })
    expect(open.status).toBeGreaterThanOrEqual(400)
    expect(open.setCookie.join(';')).not.toContain(SESSION)
  })
})

describe('per-email budgets', () => {
  it('stops sending codes to one address after 5 an hour, however the address is written', async () => {
    process.env['HADAFI_EMAIL_LIMITS'] = 'on'
    const email = `budget-${crypto.randomUUID().slice(0, 8)}@nowhere.e2e.local`
    for (let i = 0; i < 5; i++) {
      const res = await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })
      expect(res.status).toBe(200)
    }
    const sixth = await api<{ code: string }>('POST', '/api/auth/forget-password/email-otp', { body: { email: email.toUpperCase() } })
    expect(sixth.status).toBe(429)
    expect(sixth.body.code).toBe('EMAIL_RATE_LIMITED')
  })

  it('allows 10 code guesses per address an hour, across sign-in and verification', async () => {
    const target = await createTestUser('budget-code')
    process.env['HADAFI_EMAIL_LIMITS'] = 'on'
    for (let i = 0; i < 10; i++) {
      const path = i % 2 ? '/api/auth/sign-in/email-otp' : '/api/auth/email-otp/verify-email'
      const res = await api('POST', path, { body: { email: target.email, otp: '000000' } })
      expect(res.status).not.toBe(429)
    }
    const res = await api<{ code: string }>('POST', '/api/auth/sign-in/email-otp', { body: { email: target.email, otp: '000000' } })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('EMAIL_RATE_LIMITED')
  })

  it('allows 20 password attempts per address an hour, whatever the IP', async () => {
    // Created (and signed in once) before the budget is switched on.
    const target = await createTestUser('budget-pw')
    process.env['HADAFI_EMAIL_LIMITS'] = 'on'
    for (let i = 0; i < 20; i++) {
      const res = await api('POST', '/api/auth/sign-in/email', {
        body: { email: target.email, password: 'wrong-password-1' },
        headers: { 'X-Forwarded-For': `203.0.113.${i + 1}` },
      })
      expect(res.status).toBe(401)
    }
    // Even the right password waits once the budget is spent.
    const res = await api('POST', '/api/auth/sign-in/email', { body: { email: target.email, password: target.password } })
    expect(res.status).toBe(429)
  }, 60_000)
})
