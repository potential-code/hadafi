import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Human mentors are off unless HUMAN_MENTORS_ENABLED=true: the mentor lists
 * are empty and open times and booking are refused, so nobody can book a
 * mentor who can't sign in. Existing sessions can still be listed and
 * cancelled. Turning it on gives the normal behaviour back.
 */

let learner: TestUser
let mentor: TestUser
const SLOT = '00000000-0000-4000-8000-000000000000'

beforeAll(async () => {
  delete process.env['HUMAN_MENTORS_ENABLED']
  await startTestServer()
  learner = await createTestUser('hm-learner')
  mentor = await createTestUser('hm-mentor', 'mentor')
})

afterEach(() => {
  delete process.env['HUMAN_MENTORS_ENABLED']
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('human mentors switched off (the default)', () => {
  it('lists no mentors, publicly or signed in', async () => {
    const pub = await api('GET', '/api/mentors/public')
    expect(pub.status).toBe(200)
    expect(pub.body).toEqual([])
    const signedIn = await api('GET', '/api/mentors', { token: learner.token })
    expect(signedIn.status).toBe(200)
    expect(signedIn.body).toEqual([])
  })

  it('refuses open times and booking', async () => {
    const avail = await api<{ error: { code: string } }>('GET', `/api/mentors/${mentor.id}/availability`, { token: learner.token })
    expect(avail.status).toBe(403)
    expect(avail.body.error.code).toBe('HUMAN_MENTORS_OFF')
    const book = await api<{ error: { code: string } }>('POST', '/api/sessions', { token: learner.token, body: { slotId: SLOT } })
    expect(book.status).toBe(403)
    expect(book.body.error.code).toBe('HUMAN_MENTORS_OFF')
  })

  it('still lets a learner see their sessions', async () => {
    const mine = await api('GET', '/api/sessions', { token: learner.token })
    expect(mine.status).toBe(200)
    expect(mine.body).toHaveProperty('upcoming')
  })

  it('leaves the mentors\' own session list alone', async () => {
    const own = await api('GET', '/api/mentor/sessions', { token: mentor.token })
    expect(own.status).toBe(200)
  })
})

describe('human mentors switched on', () => {
  it('lists mentors and lets booking through to its own checks', async () => {
    process.env['HUMAN_MENTORS_ENABLED'] = 'true'
    const list = await api<{ id: string }[]>('GET', '/api/mentors', { token: learner.token })
    expect(list.status).toBe(200)
    expect(list.body.some((m) => m.id === mentor.id)).toBe(true)
    const avail = await api('GET', `/api/mentors/${mentor.id}/availability`, { token: learner.token })
    expect(avail.status).toBe(200)
    const book = await api<{ error?: { code?: string } }>('POST', '/api/sessions', { token: learner.token, body: { slotId: SLOT } })
    expect(book.body?.error?.code).not.toBe('HUMAN_MENTORS_OFF')
  })
})
