import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test'
import crypto from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, authVerifications, organisations } from '../db/schema'
import { parseOperatorKeys, matchOperatorKey } from '../auth/operatorKeys'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, fixtureEmail, rawHttp, ORIGIN, type TestUser } from './helpers'

/**
 * Operator keys (Maya, the AI operator): `Authorization: Bearer <key>` on
 * /api app routes authenticates as the service user named by
 * OPERATOR_SERVICE_USER_EMAIL. See docs/operator-access.md. Ported from
 * SMEEP (server/tests/operator-access.test.ts there).
 */

let base: string
let admin: TestUser
let learner: TestUser
let serviceUserId: string
const serviceEmail = fixtureEmail('maya-op')

const newKey = () => `hadafi_op_${crypto.randomBytes(32).toString('base64url')}`
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const KEY = newKey()
const SECOND_KEY = newKey()

const savedEnv = {
  keys: process.env['OPERATOR_API_KEYS'],
  email: process.env['OPERATOR_SERVICE_USER_EMAIL'],
}

function restoreEnv(): void {
  for (const [name, value] of [['OPERATOR_API_KEYS', savedEnv.keys], ['OPERATOR_SERVICE_USER_EMAIL', savedEnv.email]] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

function enableKeys(): void {
  process.env['OPERATOR_API_KEYS'] = `maya-test:${sha256(KEY)}, maya-second:${sha256(SECOND_KEY)}`
  process.env['OPERATOR_SERVICE_USER_EMAIL'] = serviceEmail
}

/** A request with an Authorization header (and optionally a session cookie). */
async function call(method: string, path: string, opts: { authorization?: string; cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(opts.authorization ? { Authorization: opts.authorization } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
  let body: unknown = null
  try { body = await res.json() } catch { /* empty body */ }
  return { status: res.status, body }
}

beforeAll(async () => {
  base = await startTestServer()
  learner = await createTestUser('op-learner')
  admin = await createTestUser('op-admin', 'admin')
  const [row] = await db.insert(users).values({ fullName: 'Maya (AI operator)', email: serviceEmail, role: 'admin' }).returning({ id: users.id })
  serviceUserId = row!.id
})

afterEach(() => {
  restoreEnv()
})

afterAll(async () => {
  restoreEnv()
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('operator key parsing', () => {
  it('reads label:sha256 entries separated by commas, spaces or new lines', () => {
    const a = sha256('a'), b = sha256('b')
    const keys = parseOperatorKeys(`maya-demo:${a},\n  maya.prod_2:${b.toUpperCase()}`)
    expect(keys.map((k) => k.label)).toEqual(['maya-demo', 'maya.prod_2'])
  })

  it('skips malformed entries (no label, short hash, raw key) instead of trusting them', () => {
    const keys = parseOperatorKeys(`:${sha256('a')}, nolabel, maya:abc123, maya:${'z'.repeat(64)}, ok:${sha256('ok')}`)
    expect(keys.map((k) => k.label)).toEqual(['ok'])
  })

  it('is empty for an unset or blank variable', () => {
    expect(parseOperatorKeys(undefined)).toEqual([])
    expect(parseOperatorKeys('  ')).toEqual([])
  })

  it('matches a raw key to its label by hash, and nothing else', () => {
    const keys = parseOperatorKeys(`first:${sha256('one')}, second:${sha256('two')}`)
    expect(matchOperatorKey('two', keys)).toBe('second')
    expect(matchOperatorKey('three', keys)).toBeNull()
    expect(matchOperatorKey('', keys)).toBeNull()
  })
})

describe('operator key authentication', () => {
  it('authenticates a valid key as the service user on an admin route', async () => {
    enableKeys()
    const res = await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}` })
    expect(res.status).toBe(200)
  })

  it('accepts any of several configured keys', async () => {
    enableKeys()
    const res = await call('GET', '/api/admin/invites', { authorization: `Bearer ${SECOND_KEY}` })
    expect(res.status).toBe(200)
  })

  it('refuses a wrong key with 401, even alongside a valid admin session', async () => {
    enableKeys()
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${newKey()}` })).status).toBe(401)
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${newKey()}`, cookie: admin.token })).status).toBe(401)
    expect((await call('GET', '/api/admin/invites', { authorization: 'Bearer ' })).status).toBe(401)
  })

  it('ignores Bearer entirely when OPERATOR_API_KEYS is unset', async () => {
    delete process.env['OPERATOR_API_KEYS']
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = serviceEmail
    // The key alone is not a sign-in…
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}` })).status).toBe(401)
    // …and a session cookie next to it works as before.
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}`, cookie: admin.token })).status).toBe(200)
  })

  it('leaves Basic credentials (the demo access gate) to the session cookie', async () => {
    enableKeys()
    const basic = `Basic ${Buffer.from('admin:pw').toString('base64')}`
    expect((await call('GET', '/api/admin/invites', { authorization: basic, cookie: admin.token })).status).toBe(200)
    expect((await call('GET', '/api/admin/invites', { authorization: basic })).status).toBe(401)
  })

  it('cookie sign-in keeps working unchanged with keys configured', async () => {
    enableKeys()
    expect((await call('GET', '/api/admin/invites', { cookie: admin.token })).status).toBe(200)
    expect((await call('GET', '/api/admin/invites', { cookie: learner.token })).status).toBe(403)
  })

  it('is not accepted by the Better Auth routes', async () => {
    enableKeys()
    const res = await call('GET', '/api/auth/get-session', { authorization: `Bearer ${KEY}` })
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('is not accepted on account routes (password, profile, tokens)', async () => {
    enableKeys()
    expect((await call('GET', '/api/account/me', { authorization: `Bearer ${KEY}` })).status).toBe(401)
    expect((await call('POST', '/api/account/set-password', { authorization: `Bearer ${KEY}`, body: { password: 'new-pass-12345' } })).status).toBe(401)
  })

  it('401s when the service user is missing', async () => {
    enableKeys()
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = fixtureEmail('missing')
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}` })).status).toBe(401)
  })

  it('401s when OPERATOR_SERVICE_USER_EMAIL is unset', async () => {
    enableKeys()
    delete process.env['OPERATOR_SERVICE_USER_EMAIL']
    expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}` })).status).toBe(401)
  })

  it('401s when the service user is not an admin', async () => {
    enableKeys()
    await db.update(users).set({ role: 'sme' }).where(eq(users.id, serviceUserId))
    try {
      expect((await call('GET', '/api/admin/invites', { authorization: `Bearer ${KEY}` })).status).toBe(401)
      // Not even on a route any signed-in learner may use.
      expect((await call('GET', '/api/me/streak', { authorization: `Bearer ${KEY}` })).status).toBe(401)
    } finally {
      await db.update(users).set({ role: 'admin' }).where(eq(users.id, serviceUserId))
    }
  })
})

describe('the service account cannot hold a browser session', () => {
  const strip = (r: { status: number; body: unknown }) => ({ status: r.status, body: r.body })

  it('refuses password sign-in for the service email with the same status and body as a wrong password', async () => {
    const svc = await createTestUser('op-svc-signin')
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = svc.email
    // Even with the right password (in case the account ever had one).
    const refused = await api('POST', '/api/auth/sign-in/email', { body: { email: svc.email, password: svc.password } })
    const wrong = await api('POST', '/api/auth/sign-in/email', { body: { email: learner.email, password: 'not-the-password-1' } })
    expect(wrong.status).toBe(401)
    expect(strip(refused)).toEqual(strip(wrong))
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([])
  })

  it('sends no sign-in code to the service email, answering as for an unknown address', async () => {
    const svc = await createTestUser('op-svc-otp')
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = svc.email
    const refused = await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email: svc.email, type: 'sign-in' } })
    const unknown = await api('POST', '/api/auth/email-otp/send-verification-otp', {
      body: { email: fixtureEmail('nobody'), type: 'sign-in' },
    })
    expect(strip(refused)).toEqual(strip(unknown))
    expect(await db.select().from(authVerifications).where(like(authVerifications.identifier, `%${svc.email}%`))).toHaveLength(0)
  })

  it('refuses code sign-in for the service email with the same status and body as a wrong code', async () => {
    const svc = await createTestUser('op-svc-code')
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = svc.email
    const refused = await api('POST', '/api/auth/sign-in/email-otp', { body: { email: svc.email, otp: '123456' } })
    const wrong = await api('POST', '/api/auth/sign-in/email-otp', { body: { email: learner.email, otp: '123456' } })
    expect(wrong.status).toBe(400)
    expect(strip(refused)).toEqual(strip(wrong))
  })

  it('refuses an existing session cookie of the service user', async () => {
    const svc = await createTestUser('op-svc-cookie', 'admin')
    const cookie = svc.token
    expect((await call('GET', '/api/admin/invites', { cookie })).status).toBe(200)
    process.env['OPERATOR_SERVICE_USER_EMAIL'] = svc.email
    expect((await call('GET', '/api/admin/invites', { cookie })).status).toBe(401)
  })
})

describe('the service account is refused by name too, not only by OPERATOR_SERVICE_USER_EMAIL', () => {
  // If the variable is unset (feature turned off, or a deploy that forgot
  // it), the account the create script made must still be unable to sign in.
  const strip = (r: { status: number; body: unknown }) => ({ status: r.status, body: r.body })

  /** A fixture user renamed to the operator name, with the variable unset. */
  async function namedOperator(prefix: string, name = 'Maya (AI operator)') {
    const svc = await createTestUser(prefix)
    await db.update(users).set({ fullName: name }).where(eq(users.id, svc.id))
    delete process.env['OPERATOR_SERVICE_USER_EMAIL']
    return svc
  }

  it('refuses password sign-in with the same status and body as a wrong password', async () => {
    const svc = await namedOperator('op-name-signin')
    const refused = await api('POST', '/api/auth/sign-in/email', { body: { email: svc.email, password: svc.password } })
    const wrong = await api('POST', '/api/auth/sign-in/email', { body: { email: learner.email, password: 'not-the-password-1' } })
    expect(wrong.status).toBe(401)
    expect(strip(refused)).toEqual(strip(wrong))
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([])
  })

  it('sends no sign-in code, answering as for an unknown address', async () => {
    const svc = await namedOperator('op-name-otp')
    const refused = await api('POST', '/api/auth/email-otp/send-verification-otp', { body: { email: svc.email, type: 'sign-in' } })
    const unknown = await api('POST', '/api/auth/email-otp/send-verification-otp', {
      body: { email: fixtureEmail('nobody'), type: 'sign-in' },
    })
    expect(strip(refused)).toEqual(strip(unknown))
    expect(await db.select().from(authVerifications).where(like(authVerifications.identifier, `%${svc.email}%`))).toHaveLength(0)
  })

  it('refuses code sign-in with the same status and body as a wrong code', async () => {
    const svc = await namedOperator('op-name-code')
    const refused = await api('POST', '/api/auth/sign-in/email-otp', { body: { email: svc.email, otp: '123456' } })
    const wrong = await api('POST', '/api/auth/sign-in/email-otp', { body: { email: learner.email, otp: '123456' } })
    expect(wrong.status).toBe(400)
    expect(strip(refused)).toEqual(strip(wrong))
  })

  it('matches the name whatever its case or surrounding spaces, and the address whatever its case', async () => {
    const svc = await namedOperator('op-name-case', '  maya (AI OPERATOR) ')
    const refused = await api('POST', '/api/auth/sign-in/email', { body: { email: svc.email.toUpperCase(), password: svc.password } })
    expect(refused.status).toBe(401)
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([])
  })

  it('refuses an existing session of an account carrying the operator name, even from the cookie cache', async () => {
    // Hadafi reads the users row on every request (middleware/authenticate.ts),
    // so a renamed account is refused at once, 5-minute cookie cache or not.
    const svc = await createTestUser('op-name-cookie', 'admin')
    const cookie = svc.token
    expect(cookie).toContain('session_data')
    expect((await call('GET', '/api/admin/invites', { cookie })).status).toBe(200)
    delete process.env['OPERATOR_SERVICE_USER_EMAIL']
    await db.update(users).set({ fullName: 'Maya (AI operator)' }).where(eq(users.id, svc.id))
    expect((await call('GET', '/api/admin/invites', { cookie })).status).toBe(401)
  })

  it('leaves other people alone, including names that merely mention Maya', async () => {
    const person = await namedOperator('op-name-person', 'Maya Operator')
    const res = await api('POST', '/api/auth/sign-in/email', { body: { email: person.email, password: person.password } })
    expect(res.status).toBe(200)
  })

  it('uses the same name as the create script', async () => {
    const { OPERATOR_SERVICE_NAME } = await import('../auth/operatorKeys')
    const script = await Bun.file(new URL('../scripts/create-operator-user.mjs', import.meta.url)).text()
    expect(script).toContain(`const NAME = '${OPERATOR_SERVICE_NAME}'`)
  })
})

describe('announcements sent with a key are rate limited per user', () => {
  // An announcement goes out as a banner, a bell notification and an email
  // to a whole audience, so a key gets a small budget: 3 an hour, 10 a day.
  // Bodies are left invalid (422) so nothing is sent; every attempt counts.
  it('answers 429 to the fourth attempt in an hour with a key, never to an admin session', async () => {
    enableKeys()
    process.env['HADAFI_RATE_LIMITS'] = 'on'
    try {
      for (let i = 0; i < 3; i++) {
        expect((await call('POST', '/api/admin/announcements', { authorization: `Bearer ${KEY}`, body: {} })).status).toBe(422)
      }
      const limited = await call('POST', '/api/admin/announcements', { authorization: `Bearer ${KEY}`, body: {} })
      expect(limited.status).toBe(429)
      expect((limited.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED')
      // The other key acts as the same service user, so it shares the budget.
      expect((await call('POST', '/api/admin/announcements', { authorization: `Bearer ${SECOND_KEY}`, body: {} })).status).toBe(429)
      // Admins in the browser are not limited here.
      for (let i = 0; i < 5; i++) {
        expect((await call('POST', '/api/admin/announcements', { cookie: admin.token, body: {} })).status).toBe(422)
      }
      // Other key routes are unaffected.
      expect((await call('GET', '/api/admin/announcements', { authorization: `Bearer ${KEY}` })).status).toBe(200)
    } finally {
      delete process.env['HADAFI_RATE_LIMITS']
    }
  })

  it('caps a key at 3 an hour and 10 a day', async () => {
    const { OPERATOR_ANNOUNCEMENT_LIMITS } = await import('../middleware/limits')
    expect(OPERATOR_ANNOUNCEMENT_LIMITS).toEqual({ perHour: 3, perDay: 10 })
  })
})

describe('absolute-form request lines', () => {
  it('cannot slip a key past the account-route refusal with "POST http://host/api/account/…"', async () => {
    enableKeys()
    const res = await rawHttp('http://x/api/account/set-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN },
      body: { password: 'operator-pass-12345', confirm: 'operator-pass-12345' },
    })
    expect(res.status).toBe(401)
    const me = await rawHttp('http://x/api/account/me', { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } })
    expect(me.status).toBe(401)
  })

  it('still serves an allowed admin route in absolute form', async () => {
    enableKeys()
    const res = await rawHttp('http://x/api/admin/invites', { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } })
    expect(res.status).toBe(200)
  })
})

describe('operator key scope (auth/operatorScope.ts)', () => {
  it('lets a key reach the routes the operator MCP uses', async () => {
    enableKeys()
    expect((await call('GET', '/api/admin/stats', { authorization: `Bearer ${KEY}` })).status).toBe(200)
    expect((await call('GET', '/api/admin/organisations', { authorization: `Bearer ${KEY}` })).status).toBe(200)
  })

  it('refuses a bulk export with a key (403) while a cookie admin still gets it', async () => {
    enableKeys()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const viaKey = await fetch(`${base}/api/admin/exports/learners?format=csv`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${KEY}` } })
      expect(viaKey.status).toBe(403)
      expect(((await viaKey.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN')
      const logged = warn.mock.calls.map((args) => args.join(' ')).join('\n')
      expect(logged).toContain('GET /api/admin/exports/learners')
      expect(logged).not.toContain('format=csv')
    } finally {
      warn.mockRestore()
    }
    const viaCookie = await fetch(`${base}/api/admin/exports/learners?format=csv`, { headers: { Origin: ORIGIN, Cookie: admin.token } })
    expect(viaCookie.status).toBe(200)
    await viaCookie.arrayBuffer()
  })

  it('names the route shape in the warning, never ids or emails from the path', async () => {
    enableKeys()
    const orgId = crypto.randomUUID()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await call('GET', `/api/admin/organisations/${orgId}/exports/learners`, { authorization: `Bearer ${KEY}` })).status).toBe(403)
      const logged = warn.mock.calls.map((args) => args.join(' ')).join('\n')
      expect(logged).toContain('GET /api/admin/organisations/:param/exports/learners')
      expect(logged).not.toContain(orgId)
    } finally {
      warn.mockRestore()
    }
  })

  it('refuses the AI report download and AI generation routes the operator MCP does not call', async () => {
    enableKeys()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await call('POST', '/api/admin/ai/report', { authorization: `Bearer ${KEY}`, body: {} })).status).toBe(403)
      expect((await call('POST', '/api/admin/quiz/generate', { authorization: `Bearer ${KEY}`, body: {} })).status).toBe(403)
      // The newsletter list is a bulk export too.
      expect((await call('GET', '/api/admin/exports/newsletter', { authorization: `Bearer ${KEY}` })).status).toBe(403)
    } finally {
      warn.mockRestore()
    }
  })

  it('refuses learner and partner routes with a key', async () => {
    enableKeys()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await call('GET', '/api/me/streak', { authorization: `Bearer ${KEY}` })).status).toBe(403)
      expect((await call('GET', '/api/lms/courses', { authorization: `Bearer ${KEY}` })).status).toBe(403)
      expect((await call('GET', '/api/partner/dashboard', { authorization: `Bearer ${KEY}` })).status).toBe(403)
    } finally {
      warn.mockRestore()
    }
  })

  it('refuses paths that routing and the allowlist could read differently', async () => {
    enableKeys()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Dot segments and encoded separators: the allowlist would see /api/admin/stats.
      for (const target of [
        '/api/admin/exports/learners%5C..%5C..%5Cstats',
        '/api/admin/exports/learners/../../stats',
        '/api/admin/exports/%2e%2e/stats',
      ]) {
        const res = await rawHttp(target, { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } })
        expect([target, res.status]).not.toEqual([target, 200])
        expect([401, 403, 404]).toContain(res.status!)
      }
    } finally {
      warn.mockRestore()
    }
  })
})

describe('a key can never hand out a login (partner invites, mentor approvals)', () => {
  // The key would choose who gets the login: an invite goes to any address it
  // names, and an approval turns an application anyone can submit publicly
  // into a mentor account. People do these in the admin UI.
  it('refuses the partner invite with a key; an admin session still invites', async () => {
    enableKeys()
    const created = await call('POST', '/api/admin/organisations', { authorization: `Bearer ${KEY}`, body: { name: 'Operator Partner Org', type: 'other' } })
    expect(created.status).toBe(201)
    const orgId = (created.body as { data: { id: string } }).data.id
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const email = fixtureEmail('op-partner')
      const viaKey = await call('POST', `/api/admin/organisations/${orgId}/partners`, { authorization: `Bearer ${KEY}`, body: { fullName: 'Op Partner', email } })
      expect(viaKey.status).toBe(403)
      // No partner login was created for the address the key named.
      expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0)

      // An admin in the browser invites.
      const viaCookie = await call('POST', `/api/admin/organisations/${orgId}/partners`, { cookie: admin.token, body: { fullName: 'Op Partner', email } })
      expect(viaCookie.status).toBe(201)

      // The key can still list partners (Hadafi partner logins have no setup link or token)...
      const listed = await call('GET', `/api/admin/organisations/${orgId}/partners`, { authorization: `Bearer ${KEY}` })
      expect(listed.status).toBe(200)
      const contacts = (listed.body as { data: Array<{ id: string; email: string; status: string }> }).data
      expect(contacts.map((c) => c.email)).toContain(email)
      expect(JSON.stringify(listed.body)).not.toMatch(/setupLink|token/i)

      // ...and remove a partner login, which only takes access away.
      const partner = contacts.find((c) => c.email === email)!
      expect((await call('DELETE', `/api/admin/organisations/${orgId}/partners/${partner.id}`, { authorization: `Bearer ${KEY}` })).status).toBe(200)
      expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0)
    } finally {
      warn.mockRestore()
      await db.delete(organisations).where(eq(organisations.id, orgId))
    }
  })

  it('refuses mentor application approve and reject with a key; an admin session still reaches them', async () => {
    enableKeys()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const id = crypto.randomUUID()
      for (const action of ['approve', 'reject']) {
        const path = `/api/admin/mentor-applications/${id}/${action}`
        expect([action, (await call('POST', path, { authorization: `Bearer ${KEY}`, body: {} })).status]).toEqual([action, 403])
        // The admin session gets past the scope check to the handler (no such application).
        expect([action, (await call('POST', path, { cookie: admin.token, body: {} })).status]).toEqual([action, 404])
      }
      // Reading the applications is still allowed.
      expect((await call('GET', '/api/admin/mentor-applications', { authorization: `Bearer ${KEY}` })).status).toBe(200)
    } finally {
      warn.mockRestore()
    }
  })
})
