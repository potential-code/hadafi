import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, mentorRegistrations, stakeholderRegistrations } from '../db/schema'
import { isHttpsUrl } from '../utils/httpsUrl'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, RUN_ID, type TestUser } from './helpers'

/**
 * Links users can save (a profile's LinkedIn and meeting link, the mentor
 * application's LinkedIn, an organisation's website) are https:// only.
 * zod's .url() let `javascript:` and `data:` links through, which run as
 * script once rendered as a link; plain http:// is refused too.
 */

const domain = `links-${RUN_ID}.e2e.local`
const visitor = { 'X-Forwarded-For': `203.0.113.${1 + Math.floor(Math.random() * 250)}` }
let mentor: TestUser

beforeAll(async () => {
  await startTestServer()
  mentor = await createTestUser('links-mentor', 'mentor')
})

afterAll(async () => {
  await db.delete(mentorRegistrations).where(like(mentorRegistrations.email, `%@${domain}`))
  await db.delete(stakeholderRegistrations).where(like(stakeholderRegistrations.email, `%@${domain}`))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const BAD = [
  'http://linkedin.com/in/someone',
  'javascript:alert(1)',
  'JavaScript://linkedin.com/%0Aalert(1)',
  'data:text/html,<script>alert(1)</script>',
  'ftp://example.com/file',
  'https://',
]

describe('isHttpsUrl', () => {
  it('accepts https links and nothing else', () => {
    expect(isHttpsUrl('https://www.linkedin.com/in/someone')).toBe(true)
    expect(isHttpsUrl('https://zoom.us/j/123?pwd=abc')).toBe(true)
    for (const v of BAD) expect(isHttpsUrl(v)).toBe(false)
  })
})

describe('profile links (PUT /api/account/me)', () => {
  it('saves https links, and "" or null clears them', async () => {
    const ok = await api('PUT', '/api/account/me', {
      token: mentor.token,
      body: { linkedinUrl: 'https://www.linkedin.com/in/someone', meetingLink: 'https://zoom.us/j/123' },
    })
    expect(ok.status).toBe(200)
    expect((await api('PUT', '/api/account/me', { token: mentor.token, body: { linkedinUrl: '', meetingLink: null } })).status).toBe(200)
  })

  it('refuses any other link, and keeps the saved one', async () => {
    await api('PUT', '/api/account/me', { token: mentor.token, body: { meetingLink: 'https://zoom.us/j/kept' } })
    for (const v of BAD) {
      expect((await api('PUT', '/api/account/me', { token: mentor.token, body: { linkedinUrl: v } })).status).toBe(422)
      expect((await api('PUT', '/api/account/me', { token: mentor.token, body: { meetingLink: v } })).status).toBe(422)
    }
    const [row] = await db.select({ meetingLink: users.meetingLink }).from(users).where(eq(users.id, mentor.id))
    expect(row?.meetingLink).toBe('https://zoom.us/j/kept')
  })
})

describe('public application forms', () => {
  it('refuse a non-https LinkedIn or website (422)', async () => {
    const expert = {
      name: 'Link Tester', email: `mentor@${domain}`, linkedin: 'javascript:alert(1)', hourlyRate: 50,
      expertise: ['Sales'], methods: ['Online'], passion: 'Testing.',
    }
    expect((await api('POST', '/api/stakeholders/expert', { body: expert, headers: visitor })).status).toBe(422)
    expect((await api('POST', '/api/stakeholders/expert', { body: { ...expert, linkedin: 'http://linkedin.com/in/x' }, headers: visitor })).status).toBe(422)
    const org = {
      type: 'corporate', fullName: 'Org Person', title: 'CEO', email: `org@${domain}`, country: 'AE',
      website: 'data:text/html,hi', phone: '+971500000000', representing: 'Org', involvement: ['Partnership'],
    }
    expect((await api('POST', '/api/stakeholders/organisation', { body: org, headers: visitor })).status).toBe(422)
    expect((await api('POST', '/api/stakeholders/organisation', { body: { ...org, website: 'https://example.org' }, headers: visitor })).status).toBe(201)
  })
})
