import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { ASK_HANA_PROMPT, SIGN_UP_PROMPT } from '../../shared/hana/prompts'
import { browserClaims, guestClaims, fingerprint, SERVER_CLAIMS } from '../services/serviceTokenClaims'

/**
 * The service tokens Hadafi mints for potential-ai say what they are for
 * (`scope`, from the verified session role) and which system prompts the page
 * may send (`prompts`, SHA-256 fingerprints of shared/hana/prompts.ts).
 */

type Claims = { platformId: string; userId?: string; scope?: string; prompts?: string[] }

const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('base64url')
let secret: string
let previousSecret: string | undefined
let learner: TestUser
let mentor: TestUser
let admin: TestUser

async function tokenFor(urlPath: string, user?: TestUser, headers?: Record<string, string>): Promise<Claims> {
  const res = await api<{ data: { token: string } }>('GET', urlPath, { token: user?.token, headers })
  expect(res.status).toBe(200)
  return jwt.verify(res.body.data.token, secret, { algorithms: ['HS256'] }) as Claims
}

beforeAll(async () => {
  previousSecret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!previousSecret) process.env['COPILOT_SERVICE_JWT_SECRET'] = 'test-secret-'.padEnd(40, 'x')
  secret = process.env['COPILOT_SERVICE_JWT_SECRET']!
  await startTestServer()
  learner = await createTestUser('tok-learner')
  mentor = await createTestUser('tok-mentor', 'mentor')
  admin = await createTestUser('tok-admin', 'admin')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
  if (previousSecret === undefined) delete process.env['COPILOT_SERVICE_JWT_SECRET']
})

describe('prompt fingerprints', () => {
  it('are the SHA-256 of the shared prompt text the browser sends', () => {
    expect(fingerprint(ASK_HANA_PROMPT)).toBe(sha(ASK_HANA_PROMPT))
    expect(browserClaims('sme').prompts).toEqual([sha(ASK_HANA_PROMPT), sha(SIGN_UP_PROMPT)])
    expect(guestClaims().prompts).toEqual([sha(SIGN_UP_PROMPT)])
  })

  it('prompts are fixed text (no per-user data baked in)', () => {
    for (const p of [ASK_HANA_PROMPT, SIGN_UP_PROMPT]) {
      expect(p.length).toBeGreaterThan(1000)
      expect(p.startsWith('You are Hana')).toBe(true)
    }
  })

  it('the client components send the shared prompts, not their own copies', () => {
    const root = path.resolve(import.meta.dir, '../..')
    const dash = readFileSync(path.join(root, 'client/components/dashboard/EmbeddedDashboardAssistant.tsx'), 'utf8')
    const landing = readFileSync(path.join(root, 'client/components/landing/LandingRegistrationChat.tsx'), 'utf8')
    expect(dash).toContain("import { ASK_HANA_PROMPT as ASSISTANT_INSTRUCTIONS } from '../../../shared/hana/prompts'")
    expect(landing).toContain("import { SIGN_UP_PROMPT as ASSISTANT_INSTRUCTIONS } from '../../../shared/hana/prompts'")
    for (const src of [dash, landing]) {
      expect(src).not.toMatch(/const ASSISTANT_INSTRUCTIONS\s*=/)
      expect(src).toMatch(/description: '__system_prompt__',\s*value: ASSISTANT_INSTRUCTIONS,/)
    }
  })

  it('server tokens carry scope server only', () => {
    expect(SERVER_CLAIMS).toEqual({ scope: 'server' })
  })
})

describe('GET /api/account/copilot-token', () => {
  it('a learner gets scope user, their own userId and both Hana prompts', async () => {
    const c = await tokenFor('/api/account/copilot-token', learner)
    expect(c.platformId).toBe('hadafi')
    expect(c.userId).toBe(learner.id)
    expect(c.scope).toBe('user')
    expect(c.prompts).toEqual([sha(ASK_HANA_PROMPT), sha(SIGN_UP_PROMPT)])
  })

  it('a mentor is a user, not an admin', async () => {
    expect((await tokenFor('/api/account/copilot-token', mentor)).scope).toBe('user')
  })

  it('an admin gets scope admin', async () => {
    const c = await tokenFor('/api/account/copilot-token', admin)
    expect(c.scope).toBe('admin')
    expect(c.userId).toBe(admin.id)
  })

  it('the scope cannot be raised from the request', async () => {
    const c = await tokenFor('/api/account/copilot-token?scope=admin&role=admin&platformId=x&userId=someone', learner, {
      'X-Scope': 'admin',
      'X-Role': 'admin',
    })
    expect(c.scope).toBe('user')
    expect(c.platformId).toBe('hadafi')
    expect(c.userId).toBe(learner.id)
  })

  it('needs a session', async () => {
    expect((await api('GET', '/api/account/copilot-token')).status).toBe(401)
  })
})

describe('GET /api/account/copilot-token/guest', () => {
  it('is scope guest with only the sign-up prompt and no user', async () => {
    const c = await tokenFor('/api/account/copilot-token/guest?scope=admin')
    expect(c.platformId).toBe('hadafi')
    expect(c.scope).toBe('guest')
    expect(c.userId).toBeUndefined()
    expect(c.prompts).toEqual([sha(SIGN_UP_PROMPT)])
    expect(c.prompts).not.toContain(sha(ASK_HANA_PROMPT))
  })

  it('stays guest even for a signed-in admin', async () => {
    expect((await tokenFor('/api/account/copilot-token/guest', admin)).scope).toBe('guest')
  })
})

describe('GET /api/account/voice-token', () => {
  it('carries the scope only (no prompts)', async () => {
    const l = await tokenFor('/api/account/voice-token', learner)
    expect(l.scope).toBe('user')
    expect(l.prompts).toBeUndefined()
    expect(l.userId).toBe(learner.id)
    expect((await tokenFor('/api/account/voice-token?scope=admin', learner)).scope).toBe('user')
    expect((await tokenFor('/api/account/voice-token', admin)).scope).toBe('admin')
  })
})
