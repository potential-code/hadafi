import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, ORIGIN, rawHttp, type TestUser } from './helpers'
import { allowedOrigins } from '../middleware/same-origin'

/**
 * State-changing /api calls must come from the site itself (Origin, or
 * Referer when there is no Origin, equal to FRONTEND_URL). A form or script
 * on another site posting with a learner's cookie gets a 403 before any
 * handler runs. Better Auth (/api/auth), the Zoom webhook and operator Bearer
 * keys are exempt (each checks its own origin or signature).
 */

let learner: TestUser
let base = ''

beforeAll(async () => {
  base = await startTestServer()
  learner = await createTestUser('same-origin')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

const putMe = (headers: Record<string, string>, token = learner.token) =>
  fetch(`${base}/api/account/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: token, ...headers },
    body: JSON.stringify({ company: 'Same origin test' }),
  })

describe('state-changing requests', () => {
  it('pass from the site itself', async () => {
    expect((await putMe({ Origin: ORIGIN })).status).toBe(200)
  })

  it('pass with a same-site Referer when the browser sent no Origin', async () => {
    expect((await putMe({ Referer: `${ORIGIN}/dashboard/profile` })).status).toBe(200)
  })

  it('are refused from another site, with the cookie', async () => {
    const res = await putMe({ Origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN_ORIGIN')
  })

  it('are refused from a look-alike origin (other port, scheme or subdomain)', async () => {
    const u = new URL(ORIGIN)
    const others = [
      `${u.protocol}//${u.hostname}:${Number(u.port || 80) + 1}`,
      `${u.protocol === 'https:' ? 'http:' : 'https:'}//${u.host}`,
      `${u.protocol}//evil.${u.host}`,
      `${ORIGIN}.evil.example`,
      'null',
    ]
    for (const origin of others) expect((await putMe({ Origin: origin })).status).toBe(403)
  })

  it('are refused with a Referer from another site', async () => {
    expect((await putMe({ Referer: 'https://evil.example/page' })).status).toBe(403)
  })

  it('are refused with neither Origin nor Referer', async () => {
    expect((await putMe({})).status).toBe(403)
  })

  it('are refused for POST, PATCH and DELETE too, before the handler runs', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/api/me/notifications/read-all`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: learner.token, Origin: 'https://evil.example' },
        body: '{}',
      })
      expect(res.status).toBe(403)
    }
  })

  it('a public form is refused from another site too', async () => {
    const res = await fetch(`${base}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('reads', () => {
  it('are not affected', async () => {
    const res = await fetch(`${base}/api/account/me`, { headers: { Cookie: learner.token, Origin: 'https://evil.example' } })
    expect(res.status).toBe(200)
  })
})

describe('exempt callers', () => {
  it('Better Auth keeps its own origin check', async () => {
    const res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ email: learner.email, password: learner.password }),
    })
    // Refused by Better Auth itself (not this guard's FORBIDDEN_ORIGIN).
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('FORBIDDEN_ORIGIN')
    expect((await api('POST', '/api/auth/sign-in/email', { body: { email: learner.email, password: learner.password } })).status).toBe(200)
  })

  it('the Zoom webhook is reached without an Origin (and checks its own signature)', async () => {
    const res = await fetch(`${base}/api/webhooks/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'meeting.started', payload: {} }),
    })
    expect(res.status).not.toBe(403)
  })

  it('an operator Bearer key needs no Origin; a wrong key is still refused', async () => {
    const saved = { keys: process.env['OPERATOR_API_KEYS'], email: process.env['OPERATOR_SERVICE_USER_EMAIL'] }
    const key = randomBytes(24).toString('base64url')
    process.env['OPERATOR_API_KEYS'] = `origin-test:${createHash('sha256').update(key).digest('hex')}`
    try {
      // A wrong key reaches authenticate(), which answers 401 (not this guard's 403).
      const wrong = await rawHttp('/api/admin/announcements', { method: 'POST', headers: { Authorization: 'Bearer not-a-key' }, body: {} })
      expect(wrong.status).toBe(401)
      // Without keys configured, a Bearer header is no exemption.
      delete process.env['OPERATOR_API_KEYS']
      const off = await rawHttp('/api/admin/announcements', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: {} })
      expect(off.status).toBe(403)
    } finally {
      for (const [name, value] of [['OPERATOR_API_KEYS', saved.keys], ['OPERATOR_SERVICE_USER_EMAIL', saved.email]] as const) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })
})

describe('allowedOrigins', () => {
  it('is FRONTEND_URL and BETTER_AUTH_URL, as origins', () => {
    expect([...allowedOrigins({ FRONTEND_URL: 'https://hadafi.potential.org/' })]).toEqual(['https://hadafi.potential.org'])
    expect([...allowedOrigins({ FRONTEND_URL: 'https://a.example', BETTER_AUTH_URL: 'https://b.example/x' })]).toEqual([
      'https://a.example',
      'https://b.example',
    ])
    // Compose passes an unset variable as "": falls back to local development, never "any".
    expect([...allowedOrigins({ FRONTEND_URL: '' })]).toEqual(['http://localhost:3000'])
  })
})
