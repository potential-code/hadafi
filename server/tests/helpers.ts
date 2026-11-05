/**
 * Shared test harness.
 *
 * Boots the real Express app on a free port (HADAFI_SKIP_LISTEN=1, set by the
 * root `test` script, stops index.ts from listening on PORT) and gives tests a
 * small fetch wrapper plus throwaway users.
 *
 * Needs a Postgres reachable via DATABASE_URL with the migrations applied and
 * Hadafi's courses seeded. The dev database is fine: test users use unique
 * emails under this run's own domain (r<run>.e2e.local) and only this run's
 * users are deleted afterwards, so two suites can share one database. Mailpit (:8025/:1025) is
 * optional: the email-code round trips in auth.test.ts skip without it.
 */
import type { Server } from 'node:http'
import { and, eq, like, lt } from 'drizzle-orm'
import { app } from '../index'
import { db } from '../db'
import { users } from '../db/schema'
import { createLearnerAccount } from '../auth/accounts'

/** The site origin Better Auth trusts (its CSRF check rejects other origins). */
export const ORIGIN = process.env['BETTER_AUTH_URL'] || process.env['FRONTEND_URL'] || 'http://localhost:3000'

/** One id per test process: every fixture email of this run ends in @r<RUN_ID>.e2e.local. */
export const RUN_ID = crypto.randomUUID().slice(0, 8)
const RUN_DOMAIN = `r${RUN_ID}.e2e.local`

/** A unique throwaway address owned by this run (removed by cleanupFixtureUsers). */
export function fixtureEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`
}

let server: Server | null = null
let baseUrl = ''

/** Starts the app on an ephemeral port (idempotent across test files). */
export async function startTestServer(): Promise<string> {
  if (server) return baseUrl
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const address = server!.address()
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind a TCP port')
  baseUrl = `http://127.0.0.1:${address.port}`
  return baseUrl
}

export async function stopTestServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())))
  server = null
}

export interface ApiResponse<T = unknown> {
  status: number
  body: T
}

/**
 * JSON request against the test server. `token` is a session Cookie header
 * value (see TestUser.token), sent as a browser would.
 */
export async function api<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T> & { headers: Headers; setCookie: string[] }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(opts.token ? { Cookie: opts.token } : {}),
      ...opts.headers,
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // not JSON (a file, or empty)
  }
  return { status: res.status, body: body as T, headers: res.headers, setCookie: res.headers.getSetCookie() }
}

/** Turns Set-Cookie headers into a Cookie header value (dropping expired ones). */
export function cookieHeader(setCookie: string[]): string {
  return setCookie
    .filter((c) => !/max-age=0/i.test(c))
    .map((c) => c.split(';')[0])
    .join('; ')
}

/** Signs in with email + password and returns the session Cookie header value. */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await api('POST', '/api/auth/sign-in/email', { body: { email, password } })
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`)
  return cookieHeader(res.setCookie)
}

export interface TestUser {
  id: string
  email: string
  role: string
  password: string
  /** Session Cookie header value, as Better Auth sets it at sign-in; pass as `token` to api(). */
  token: string
}

let counter = 0

/**
 * Creates a throwaway, already-verified user and signs it in the Better Auth
 * way (email + password, session cookie). Sign-up itself (email code first)
 * is covered by auth.test.ts; fixtures skip the email round trip so suites
 * run without Mailpit.
 */
export async function createTestUser(label: string, role: 'sme' | 'mentor' | 'admin' = 'sme'): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${counter++}@${RUN_DOMAIN}`
  const password = 'e2e-pass-12345'
  const id = await createLearnerAccount({ fullName: `Test ${label}`, email, password, country: 'AE' })
  if (role !== 'sme') await db.update(users).set({ role }).where(eq(users.id, id))
  return { id, email, role, password, token: await signIn(email, password) }
}

/**
 * Deletes this run's test users (their progress, points and certificates
 * cascade), plus leftovers from runs that died more than a day ago. Users of
 * a suite running at the same time are left alone.
 */
export async function cleanupFixtureUsers(): Promise<void> {
  await db.delete(users).where(like(users.email, `%@${RUN_DOMAIN}`))
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await db.delete(users).where(and(like(users.email, '%.e2e.local'), lt(users.createdAt, dayAgo)))
  await db.delete(users).where(and(like(users.email, '%@e2e.local'), lt(users.createdAt, dayAgo)))
}

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025'

/** True when a Mailpit instance is reachable (enables the email-code tests). */
export async function mailpitAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * The 6-digit code in the newest email Mailpit received for `email` after
 * `since` (ms; pass Date.now() from just before the request that sends it),
 * waiting up to ~5s for it to arrive. Null when none came.
 */
export async function fetchOtpFromMailpit(email: string, since = 0, tries = 20): Promise<string | null> {
  const query = encodeURIComponent(`to:"${email}"`)
  for (let i = 0; i < tries; i++) {
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}&limit=5`)).json()) as {
      messages?: Array<{ ID: string; Created: string }>
    }
    // Mailpit stores times to the second; allow a second of slack.
    const msg = list.messages?.find((m) => Date.parse(m.Created) >= since - 1000)
    if (msg) {
      const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as { Text: string }
      const code = detail.Text.match(/\b(\d{6})\b/)?.[1]
      if (code) return code
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 250))
  }
  return null
}
