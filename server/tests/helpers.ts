/**
 * Shared test harness.
 *
 * Boots the real Express app on a free port (HADAFI_SKIP_LISTEN=1, set by the
 * root `test` script, stops index.ts from listening on PORT) and gives tests a
 * small fetch wrapper plus throwaway users.
 *
 * Needs a Postgres reachable via DATABASE_URL with the migrations applied and
 * Hadafi's courses seeded. The dev database is fine: test users use unique
 * @e2e.local emails and are deleted afterwards.
 */
import type { Server } from 'node:http'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { like } from 'drizzle-orm'
import { app } from '../index'
import { db } from '../db'
import { users } from '../db/schema'

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

/** JSON request against the test server, signed in as `token` when given. */
export async function api<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T> & { headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
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
  return { status: res.status, body: body as T, headers: res.headers }
}

export interface TestUser {
  id: string
  email: string
  role: string
  /** A session token, as the sign-in endpoint would issue. */
  token: string
}

let counter = 0

/** Creates a user straight in the database and signs a token for it. */
export async function createTestUser(label: string, role: 'sme' | 'mentor' | 'admin' = 'sme'): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${counter++}@e2e.local`
  const [row] = await db.insert(users).values({
    fullName: `Test ${label}`,
    email,
    passwordHash: await bcrypt.hash('not-used-in-tests', 4),
    role,
  }).returning({ id: users.id })
  const token = jwt.sign({ userId: row!.id, role }, process.env['JWT_SECRET']!, { algorithm: 'HS256', expiresIn: '1h' })
  return { id: row!.id, email, role, token }
}

/** Deletes every test user (their progress, points and certificates cascade). */
export async function cleanupFixtureUsers(): Promise<void> {
  await db.delete(users).where(like(users.email, '%@e2e.local'))
}
