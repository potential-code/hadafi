import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { announcements, announcementViews, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import {
  announcementDeps,
  displayStatus,
  registerAudience,
  runAnnouncementDispatch,
  unsubscribeToken,
} from '../services/announcements.service'

/**
 * Announcements: admin only, safe links, banner per audience, the bell,
 * drafts and scheduling, ending one (banner and unread bell items come down),
 * reach, emails off unless ANNOUNCEMENT_EMAILS_ENABLED=true, the
 * audience seam for other kinds, and one-click unsubscribe.
 */

let learner: TestUser
let mentor: TestUser
let admin: TestUser
const TITLE = `E2E announcement ${Date.now()}`

type Row = { id: string; status: string; displayStatus: string; reach: number; audienceSize: number; audienceLabel: string }
const create = (body: object, token = admin.token) => api<{ data: Row }>('POST', '/api/admin/announcements', { token, body })
const banners = (token: string) => api<{ data: { id: string; title: string }[] }>('GET', '/api/me/announcements', { token })
const listAll = () => api<{ data: Row[] }>('GET', '/api/admin/announcements', { token: admin.token })
const bellItem = (userId: string, id: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.dedupeKey, `announcement:${id}`)))

const base = {
  title: TITLE,
  body: 'The Funding and Investment course is now open.',
  linkUrl: '/dashboard/courses',
  linkLabel: 'See courses',
  audience: 'learners',
  showBanner: true,
  notify: false,
  email: false,
  mode: 'now',
}

const realSend = announcementDeps.sendMail
const env = process.env['ANNOUNCEMENT_EMAILS_ENABLED']

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('ann')
  mentor = await createTestUser('ann-mentor', 'mentor')
  admin = await createTestUser('ann-admin', 'admin')
})

afterEach(() => {
  announcementDeps.sendMail = realSend
  if (env === undefined) delete process.env['ANNOUNCEMENT_EMAILS_ENABLED']
  else process.env['ANNOUNCEMENT_EMAILS_ENABLED'] = env
})

afterAll(async () => {
  // Sending to "learners" reached every learner in this database.
  await db.delete(notifications).where(like(notifications.title, `${TITLE}%`))
  await db.delete(announcements).where(like(announcements.title, `${TITLE}%`))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('who may send', () => {
  it('is admin only', async () => {
    expect((await create(base, learner.token)).status).toBe(403)
    expect((await create(base, mentor.token)).status).toBe(403)
    expect((await api('GET', '/api/admin/announcements', { token: learner.token })).status).toBe(403)
    expect((await api('POST', '/api/admin/announcements', { body: base })).status).toBe(401)
  })

  it('refuses one with no way to send it, an unsafe link, or an unknown audience', async () => {
    expect((await create({ ...base, showBanner: false, notify: false })).status).toBe(422)
    for (const linkUrl of ['javascript:alert(1)', '//evil.example', 'http://insecure.example', 'https://x.example/"><script>']) {
      expect((await create({ ...base, linkUrl })).status).toBe(422)
    }
    expect((await create({ ...base, audience: 'everyone-ever' })).status).toBe(422)
    expect((await create({ ...base, title: 'x'.repeat(61) })).status).toBe(422)
    expect((await create({ ...base, body: 'x'.repeat(281) })).status).toBe(422)
  })
})

describe('banner and bell', () => {
  it('shows a learners banner to learners only, rings their bell, and counts reach', async () => {
    const res = await create({ ...base, title: `${TITLE} live`, notify: true })
    expect(res.status).toBe(201)
    const id = res.body.data.id
    expect(res.body.data.audienceSize).toBeGreaterThanOrEqual(1)

    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(true)
    expect((await banners(mentor.token)).body.data.some((a) => a.id === id)).toBe(false)
    expect((await bellItem(mentor.id, id)).length).toBe(0)

    const [bell] = await bellItem(learner.id, id)
    expect(bell?.link).toBe('/dashboard/courses')
    expect(bell?.type).toBe('announcement')

    // The learner was shown the banner: she counts once, however often she looks.
    await banners(learner.token)
    const views = await db.select().from(announcementViews).where(and(eq(announcementViews.announcementId, id), eq(announcementViews.userId, learner.id)))
    expect(views.length).toBe(1)
    const row = (await listAll()).body.data.find((r) => r.id === id)!
    expect(row).toMatchObject({ displayStatus: 'live', audienceLabel: 'All learners' })
    expect(row.reach).toBeGreaterThanOrEqual(1)
  })

  it('a mentors announcement reaches mentors, with the bell pointing at their dashboard', async () => {
    const res = await create({ ...base, title: `${TITLE} mentors`, audience: 'mentors', notify: true })
    const id = res.body.data.id
    expect((await banners(mentor.token)).body.data.some((a) => a.id === id)).toBe(true)
    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(false)
    const [bell] = await bellItem(mentor.id, id)
    // A learner page link is no use to a mentor: it opens the mentor dashboard instead.
    expect(bell?.link).toBe('/mentor/dashboard')
  })

  it('ending it takes the banner down and removes unread bell items, keeping read ones', async () => {
    const other = await createTestUser('ann-other')
    const res = await create({ ...base, title: `${TITLE} end`, notify: true })
    const id = res.body.data.id
    const [read] = await bellItem(learner.id, id)
    await api('POST', `/api/me/notifications/${read!.id}/read`, { token: learner.token })

    expect((await api('POST', `/api/admin/announcements/${id}/end`, { token: admin.token })).status).toBe(200)
    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(false)
    expect((await bellItem(learner.id, id)).length).toBe(1)
    expect((await bellItem(other.id, id)).length).toBe(0)
    expect((await api('POST', `/api/admin/announcements/${id}/end`, { token: admin.token })).status).toBe(404)
    expect((await listAll()).body.data.find((r) => r.id === id)?.displayStatus).toBe('ended')
  })
})

describe('drafts and scheduling', () => {
  it('a draft reaches nobody until it is sent', async () => {
    const res = await create({ ...base, title: `${TITLE} draft`, notify: true, mode: 'draft' })
    expect(res.status).toBe(201)
    const id = res.body.data.id
    expect(res.body.data.status).toBe('draft')
    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(false)
    expect((await bellItem(learner.id, id)).length).toBe(0)

    const sent = await api<{ data: Row }>('PUT', `/api/admin/announcements/${id}`, { token: admin.token, body: { ...base, title: `${TITLE} draft sent`, notify: true } })
    expect(sent.status).toBe(200)
    expect(sent.body.data.status).toBe('sent')
    expect((await bellItem(learner.id, id)).length).toBe(1)
    // Once sent it can't be edited or deleted, only ended.
    expect((await api('PUT', `/api/admin/announcements/${id}`, { token: admin.token, body: base })).status).toBe(404)
    expect((await api('DELETE', `/api/admin/announcements/${id}`, { token: admin.token })).status).toBe(404)
  })

  it('a scheduled one goes out on time, once, and comes down on its end date', async () => {
    const startsAt = new Date(Date.now() + 2 * 3_600_000)
    const endsAt = new Date(Date.now() + 26 * 3_600_000)
    expect((await create({ ...base, mode: 'schedule', startsAt: new Date(Date.now() - 60_000).toISOString() })).status).toBe(422)
    expect((await create({ ...base, mode: 'schedule', startsAt: startsAt.toISOString(), endsAt: new Date(+startsAt - 1000).toISOString() })).status).toBe(422)

    const res = await create({ ...base, title: `${TITLE} scheduled`, notify: true, mode: 'schedule', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
    expect(res.status).toBe(201)
    const id = res.body.data.id
    expect(res.body.data.status).toBe('scheduled')
    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(false)

    await runAnnouncementDispatch(new Date(+startsAt + 1000))
    const [row] = await db.select().from(announcements).where(eq(announcements.id, id))
    expect(row!.status).toBe('sent')
    expect((await bellItem(learner.id, id)).length).toBe(1)
    // A second pass doesn't send it again.
    await runAnnouncementDispatch(new Date(+startsAt + 2000))
    expect((await bellItem(learner.id, id)).length).toBe(1)

    await runAnnouncementDispatch(new Date(+endsAt + 1000))
    const [ended] = await db.select().from(announcements).where(eq(announcements.id, id))
    expect(ended!.archivedAt).not.toBeNull()
    expect(displayStatus(ended!)).toBe('ended')
    expect((await bellItem(learner.id, id)).length).toBe(0)
  })

  it('a scheduled one can be cancelled', async () => {
    const res = await create({ ...base, title: `${TITLE} cancel`, mode: 'schedule', startsAt: new Date(Date.now() + 3_600_000).toISOString() })
    expect((await api('DELETE', `/api/admin/announcements/${res.body.data.id}`, { token: admin.token })).status).toBe(200)
    expect((await db.select().from(announcements).where(eq(announcements.id, res.body.data.id))).length).toBe(0)
  })
})

describe('email', () => {
  it('is refused while ANNOUNCEMENT_EMAILS_ENABLED is off, and nothing is sent', async () => {
    delete process.env['ANNOUNCEMENT_EMAILS_ENABLED']
    const sent: string[] = []
    announcementDeps.sendMail = async (o) => void sent.push(o.to)
    const res = await create({ ...base, title: `${TITLE} email off`, email: true })
    expect(res.status).toBe(422)
    expect(sent.length).toBe(0)
    const count = await api<{ data: { emailEnabled: boolean } }>('GET', '/api/admin/announcements/audience?audience=learners', { token: admin.token })
    expect(count.body.data.emailEnabled).toBe(false)
  })

  it('when switched on, emails the audience except people who unsubscribed', async () => {
    process.env['ANNOUNCEMENT_EMAILS_ENABLED'] = 'true'
    const optedOut = await createTestUser('ann-optout')
    await api('PUT', '/api/me/announcements/email-preference', { token: optedOut.token, body: { announcements: false } })
    const sent: { to: string; context: Record<string, unknown> }[] = []
    announcementDeps.sendMail = async (o) => void sent.push({ to: o.to, context: o.context })
    // A registered audience of just these two learners keeps the test from mailing the whole database.
    registerAudience('e2e-pair', {
      roles: ['sme'],
      resolve: async () => [
        { id: learner.id, role: 'sme', fullName: 'Test ann', email: learner.email },
        { id: optedOut.id, role: 'sme', fullName: 'Test optout', email: optedOut.email },
      ],
      includes: async (userId) => userId === learner.id || userId === optedOut.id,
    })
    const res = await create({ ...base, title: `${TITLE} email on`, audience: 'e2e-pair', email: true })
    expect(res.status).toBe(201)
    await new Promise((r) => setTimeout(r, 300))
    expect(sent.map((s) => s.to)).toEqual([learner.email])
    expect(String(sent[0]!.context['unsubscribeUrl'])).toContain('/unsubscribe?token=')
  })
})

describe('audience seam', () => {
  it('a registered audience shows its banner only to the people it includes', async () => {
    const outsider = await createTestUser('ann-outsider')
    registerAudience('e2e-one', {
      roles: ['sme'],
      resolve: async () => [{ id: learner.id, role: 'sme', fullName: 'Test ann', email: learner.email }],
      includes: async (userId, ref) => ref === 'group-1' && userId === learner.id,
      label: async (ref) => `Group ${ref}`,
    })
    const res = await create({ ...base, title: `${TITLE} seam`, audience: 'e2e-one', audienceRef: 'group-1', notify: true })
    const id = res.body.data.id
    expect(res.body.data.audienceSize).toBe(1)
    expect((await banners(learner.token)).body.data.some((a) => a.id === id)).toBe(true)
    expect((await banners(outsider.token)).body.data.some((a) => a.id === id)).toBe(false)
    expect((await bellItem(outsider.id, id)).length).toBe(0)
    expect((await listAll()).body.data.find((r) => r.id === id)?.audienceLabel).toBe('Group group-1')
  })
})

describe('unsubscribe', () => {
  it('turns announcement emails off from the email link, without signing in', async () => {
    const res = await api('POST', '/api/announcements/unsubscribe', { body: { token: unsubscribeToken(learner.id) } })
    expect(res.status).toBe(200)
    const prefs = await api<{ data: { announcements: boolean } }>('GET', '/api/me/announcements/email-preference', { token: learner.token })
    expect(prefs.body.data.announcements).toBe(false)
    await api('PUT', '/api/me/announcements/email-preference', { token: learner.token, body: { announcements: true } })
  })

  it('refuses a forged or malformed token', async () => {
    const forged = `${Buffer.from(learner.id).toString('base64url')}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    expect((await api('POST', '/api/announcements/unsubscribe', { body: { token: forged } })).status).toBe(400)
    expect((await api('POST', '/api/announcements/unsubscribe', { body: { token: 'not-a-token-at-all' } })).status).toBe(400)
    const prefs = await api<{ data: { announcements: boolean } }>('GET', '/api/me/announcements/email-preference', { token: learner.token })
    expect(prefs.body.data.announcements).toBe(true)
  })
})
