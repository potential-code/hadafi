import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { startTestServer, stopTestServer, rawHttp } from './helpers'

/**
 * The old Basic-auth "access gate" (shared/access-gate.ts) is gone. It fell
 * back to a built-in username and password when ACCESS_PASSWORD was unset, and
 * it guarded nothing real: it ran only on the API server, after /uploads, and
 * let every /api path through, so it only ever stood in front of 404s. The
 * site's pages never used it. Removing it removes the built-in password.
 */

beforeAll(async () => {
  await startTestServer()
})

afterAll(async () => {
  await stopTestServer()
})

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

describe('the old access gate', () => {
  it('is not in the code any more', () => {
    expect(existsSync(path.resolve(import.meta.dir, '../../shared/access-gate.ts'))).toBe(false)
    expect(existsSync(path.resolve(import.meta.dir, '../middleware/basic-auth.ts'))).toBe(false)
  })

  it('asks no one for a password: a non-API path is a plain 404', async () => {
    const res = await rawHttp('/some-page')
    expect(res.status).toBe(404)
    expect(res.text.toLowerCase()).not.toContain('www-authenticate')
  })

  it('the old built-in credentials open nothing', async () => {
    const res = await rawHttp('/some-page', { headers: { Authorization: basic('admin', 'Potential') } })
    expect(res.status).toBe(404)
  })

  it('the API still answers', async () => {
    const res = await rawHttp('/api/health')
    expect(res.status).toBe(200)
  })
})
