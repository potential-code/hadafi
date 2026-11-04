import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createHmac } from 'node:crypto'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { liveEvents, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, ORIGIN, type TestUser } from './helpers'
import { zoomMock, ZoomError } from '../services/zoom'
import { reconcileZoom, syncAttendance, groupSessions } from '../services/eventZoom.service'
import { reminderDeps, sendEventReminders } from '../services/reminders.service'
import { legacyStart, zonedToInstant, displayCopies } from '../services/eventTimes'

/**
 * Live events (port of SMEEP e1cec80): real times with a time zone, where
 * they happen (a Zoom meeting Hadafi creates, another link, or a place),
 * bookings with a number of places, join links only for people who booked and
 * only near the start, reminders, time-change and cancellation notices,
 * attendance and the Zoom webhook. Zoom is the in-memory mock here.
 */

const T = `E2E live event ${Date.now()}`
const SECRET = 'test-webhook-secret'

let base: string
let admin: TestUser
let learner: TestUser
let other: TestUser
let third: TestUser

type View = {
  id: string
  meetingLink: string | null
  booked: boolean
  spotsLeft: number | null
  full: boolean
  joinOpensAt: string | null
  joinPending: boolean
  meetingId: string | null
  passcode: string | null
  format: string
}
type Admin = {
  id: string
  zoom: { status: string; meetingId: string | null; error: string | null; joinUrl: string | null }
  bookings: number
  durationMinutes: number
  time: string
  date: string
  startsAt: string
  timezone: string
  startDate: string
  startTime: string
  timeNeedsReview: boolean
  legacyTime: string | null
}

const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString()
const create = (body: object) => api<{ data: Admin; error?: { code: string } }>('POST', '/api/live-events', { token: admin.token, body: { status: 'published', ...body } })
const mine = async (u: TestUser, id: string) => (await api<{ data: View[] }>('GET', '/api/live-events/mine', { token: u.token })).body.data.find((e) => e.id === id)!
const book = (u: TestUser, id: string) => api<{ data: View; error?: { code: string } }>('POST', `/api/live-events/${id}/rsvp`, { token: u.token })
const unbook = (u: TestUser, id: string) => api<{ data: View }>('DELETE', `/api/live-events/${id}/rsvp`, { token: u.token })
const notes = (u: TestUser, titlePart: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, u.id), like(notifications.title, `%${titlePart}%`)))

beforeAll(async () => {
  base = await startTestServer()
  process.env['ZOOM_WEBHOOK_SECRET_TOKEN'] = SECRET
  admin = await createTestUser('ev-admin', 'admin')
  learner = await createTestUser('ev-learner')
  other = await createTestUser('ev-other')
  third = await createTestUser('ev-third')
})

afterAll(async () => {
  await db.delete(notifications).where(like(notifications.title, `%${T}%`))
  await db.delete(liveEvents).where(like(liveEvents.title, `${T}%`))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('event times', () => {
  it('reads the old free-text times as UAE time, and flags what it cannot read', () => {
    expect(legacyStart('2021-03-29', '5:00 PM / GST - UAE time')).toEqual({ startsAt: new Date('2021-03-29T13:00:00Z'), needsReview: false })
    expect(legacyStart('2026-11-10', '17:30')?.startsAt.toISOString()).toBe('2026-11-10T13:30:00.000Z')
    expect(legacyStart('2026-11-10', '10am')?.startsAt.toISOString()).toBe('2026-11-10T06:00:00.000Z')
    expect(legacyStart('2026-11-10', '12:15 am')?.startsAt.toISOString()).toBe('2026-11-09T20:15:00.000Z')
    expect(legacyStart('2026-11-10', 'TBC')).toEqual({ startsAt: new Date('2026-11-10T08:00:00Z'), needsReview: true })
    expect(legacyStart('2026-11-10', '6:00 PM EST')?.needsReview).toBe(true)
    expect(legacyStart('2026-02-30', '5 PM')).toBeNull()
  })

  it('turns a day and time in a zone into the right instant, across daylight saving', () => {
    expect(zonedToInstant('2026-11-10', '17:00', 'Asia/Dubai')?.toISOString()).toBe('2026-11-10T13:00:00.000Z')
    expect(zonedToInstant('2026-07-01', '09:00', 'Europe/London')?.toISOString()).toBe('2026-07-01T08:00:00.000Z')
    expect(zonedToInstant('2026-12-01', '09:00', 'Europe/London')?.toISOString()).toBe('2026-12-01T09:00:00.000Z')
    expect(zonedToInstant('2026-11-10', '25:00', 'Asia/Dubai')).toBeNull()
    expect(zonedToInstant('2026-11-10', '10:00', 'Not/AZone')).toBeNull()
    expect(displayCopies(new Date('2026-11-10T13:00:00Z'))).toEqual({ date: '2026-11-10', time: '5:00 PM GST (UAE time)' })
  })
})

describe('admin management', () => {
  it('creates an event from a day, a time and a time zone, with its Zoom meeting in that zone', async () => {
    const res = await create({ title: `${T} Riyadh`, startDate: '2030-03-10', startTime: '18:00', timezone: 'Asia/Riyadh', durationMinutes: 90, format: 'zoom' })
    expect(res.status).toBe(201)
    const e = res.body.data
    expect(e.startsAt).toBe('2030-03-10T15:00:00.000Z')
    expect(e.timezone).toBe('Asia/Riyadh')
    expect([e.startDate, e.startTime]).toEqual(['2030-03-10', '18:00'])
    expect(e.date).toBe('2030-03-10')
    expect(e.time).toContain('6:00 PM')
    expect(e.durationMinutes).toBe(90)
    expect(e.zoom.status).toBe('active')
    const meeting = zoomMock().meetings.get(e.zoom.meetingId!)
    expect(meeting).toMatchObject({ timezone: 'Asia/Riyadh', durationMinutes: 90 })
  })

  it('still accepts the old date and free-text time, keeping the text and flagging what it cannot read', async () => {
    const ok = await create({ title: `${T} legacy`, date: '2030-04-01', time: '5:00 PM / GST - UAE time', status: 'draft' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.startsAt).toBe('2030-04-01T13:00:00.000Z')
    expect(ok.body.data.timeNeedsReview).toBe(false)
    const vague = await create({ title: `${T} vague`, date: '2030-04-02', time: 'Evening, to be confirmed', status: 'draft' })
    expect(vague.body.data.timeNeedsReview).toBe(true)
    expect(vague.body.data.legacyTime).toBe('Evening, to be confirmed')
    expect(vague.body.data.time).toBe('Evening, to be confirmed')
    // Setting a real time clears the flag.
    const fixed = await api<{ data: Admin }>('PATCH', `/api/live-events/${vague.body.data.id}`, { token: admin.token, body: { startDate: '2030-04-02', startTime: '19:00' } })
    expect(fixed.body.data.timeNeedsReview).toBe(false)
    expect(fixed.body.data.time).toBe('7:00 PM GST (UAE time)')
  })

  it('refuses a missing place, a bad zone, a day that does not exist, a bad link and a missing time', async () => {
    expect((await create({ title: `${T} x`, startsAt: at(2880), format: 'in_person' })).status).toBe(422)
    expect((await create({ title: `${T} x`, startDate: '2030-01-01', startTime: '10:00', timezone: 'Mars/Base' })).status).toBe(422)
    expect((await create({ title: `${T} x`, startDate: '2030-02-30', startTime: '10:00' })).status).toBe(422)
    expect((await create({ title: `${T} x`, startsAt: at(2880), meetingLink: 'javascript:alert(1)' })).status).toBe(422)
    expect((await create({ title: `${T} x`, startsAt: at(2880), durationMinutes: 5 })).status).toBe(422)
    expect((await create({ title: `${T} x` })).status).toBe(422)
  })

  it('is admin only', async () => {
    const e = (await create({ title: `${T} guarded`, startsAt: at(2880), status: 'draft' })).body.data
    const body = { title: 'x', startsAt: at(300) }
    expect((await api('POST', '/api/live-events', { token: learner.token, body })).status).toBe(403)
    expect((await api('POST', '/api/live-events', { body })).status).toBe(401)
    expect((await api('PATCH', `/api/live-events/${e.id}`, { token: learner.token, body: { title: 'hijack' } })).status).toBe(403)
    expect((await api('DELETE', `/api/live-events/${e.id}`, { token: learner.token })).status).toBe(403)
    expect((await api('GET', '/api/live-events/admin', { token: learner.token })).status).toBe(403)
    expect((await api('GET', `/api/live-events/${e.id}/bookings`, { token: learner.token })).status).toBe(403)
    expect((await api('GET', `/api/live-events/${e.id}/bookings/export?format=csv`, { token: learner.token })).status).toBe(403)
    expect((await api('POST', `/api/live-events/${e.id}/zoom/resync`, { token: learner.token })).status).toBe(403)
    expect((await api('GET', '/api/live-events/admin/zoom', { token: learner.token })).status).toBe(403)
    // Admins can't book: bookings are for learners.
    expect((await api('POST', `/api/live-events/${e.id}/rsvp`, { token: admin.token })).status).toBe(403)
  })
})

describe('booking and join links', () => {
  it('never shows a link to the public, nor to a learner who has not booked', async () => {
    const e = (await create({ title: `${T} soon link`, startsAt: at(30), format: 'link', meetingLink: 'https://meet.example.com/hadafi' })).body.data
    const pub = await api<{ data: Array<Record<string, unknown>> }>('GET', '/api/live-events')
    const p = pub.body.data.find((x) => x.id === e.id)!
    expect(p.meetingLink).toBeNull()
    expect(JSON.stringify(pub.body)).not.toContain('meet.example.com')
    expect(p).not.toHaveProperty('booked')
    const before = await mine(learner, e.id)
    expect(before.booked).toBe(false)
    expect(before.meetingLink).toBeNull()

    const booked = await book(learner, e.id)
    expect(booked.status).toBe(200)
    expect(booked.body.data.meetingLink).toBe('https://meet.example.com/hadafi')
    expect((await mine(learner, e.id)).meetingLink).toBe('https://meet.example.com/hadafi')
    expect((await mine(other, e.id)).meetingLink).toBeNull()
  })

  it('keeps the link hidden from a booked learner until an hour before the start', async () => {
    const e = (await create({ title: `${T} later link`, startsAt: at(48 * 60), format: 'link', meetingLink: 'https://meet.example.com/later' })).body.data
    const res = await book(learner, e.id)
    expect(res.body.data.booked).toBe(true)
    expect(res.body.data.meetingLink).toBeNull()
    expect(res.body.data.joinOpensAt).toBe(new Date(Date.parse(e.startsAt) - 60 * 60_000).toISOString())
    // Moving it to start in 40 minutes opens it.
    await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { startsAt: at(40) } })
    expect((await mine(learner, e.id)).meetingLink).toBe('https://meet.example.com/later')
  })

  it('gives each learner her own Zoom link near the start, never the generic or host link', async () => {
    const e = (await create({ title: `${T} zoom soon`, startsAt: at(20), format: 'zoom' })).body.data
    const a = (await book(learner, e.id)).body.data
    const b = (await book(other, e.id)).body.data
    expect(a.meetingLink).toMatch(/^https:\/\/zoom\.us\/w\//)
    expect(b.meetingLink).toMatch(/^https:\/\/zoom\.us\/w\//)
    expect(a.meetingLink).not.toBe(b.meetingLink)
    expect(a.meetingId).toBe(e.zoom.meetingId)
    const asThird = await api<{ data: View[] }>('GET', '/api/live-events/mine', { token: third.token })
    const t = asThird.body.data.find((x) => x.id === e.id)!
    expect([t.meetingLink, t.meetingId, t.passcode]).toEqual([null, null, null])
    const raw = JSON.stringify((await api('GET', '/api/live-events/mine', { token: learner.token })).body)
    expect(raw).not.toContain(e.zoom.joinUrl!)
    expect(raw).not.toContain('zoom.us/s/')
    expect(raw).not.toContain(b.meetingLink!)
  })

  it("doesn't let a learner see who else booked", async () => {
    const e = (await create({ title: `${T} private`, startsAt: at(3000), capacity: 10 })).body.data
    await book(other, e.id)
    const res = await api('GET', '/api/live-events/mine', { token: learner.token })
    const raw = JSON.stringify(res.body)
    expect(raw).not.toContain(other.email)
    expect(raw).not.toContain(other.id)
    expect((await mine(learner, e.id)).spotsLeft).toBe(9)
    await book(learner, e.id)
    // Admins can't drop the places below the bookings.
    const shrink = await api<{ error: { code: string } }>('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { capacity: 1 } })
    expect(shrink.status).toBe(422)
    expect(shrink.body.error.code).toBe('CAPACITY_BELOW_BOOKINGS')
  })

  it('stops at capacity, even when two learners take the last place at once', async () => {
    const e = (await create({ title: `${T} capacity`, startsAt: at(3000), capacity: 1 })).body.data
    const [r1, r2] = await Promise.all([book(learner, e.id), book(other, e.id)])
    expect([r1.status, r2.status].sort()).toEqual([200, 409])
    const loser = r1.status === 409 ? r1 : r2
    expect(loser.body.error?.code).toBe('EVENT_FULL')
    const winner = r1.status === 200 ? learner : other
    const waiting = r1.status === 200 ? other : learner
    // Booking again is harmless; the full flag shows to everyone.
    expect((await book(winner, e.id)).status).toBe(200)
    expect(await mine(waiting, e.id)).toMatchObject({ full: true, spotsLeft: 0, booked: false })
    // Cancelling frees the place.
    expect((await unbook(winner, e.id)).body.data.booked).toBe(false)
    expect((await book(waiting, e.id)).status).toBe(200)
    const bookings = await api<{ data: { bookings: { email: string }[] } }>('GET', `/api/live-events/${e.id}/bookings`, { token: admin.token })
    expect(bookings.body.data.bookings.map((b) => b.email)).toEqual([waiting.email])
  })

  it('cancelling removes the Zoom registration', async () => {
    const e = (await create({ title: `${T} zoom cancel`, startsAt: at(3000), format: 'zoom' })).body.data
    await book(learner, e.id)
    expect(zoomMock().meetings.get(e.zoom.meetingId!)!.registrants.size).toBe(1)
    const res = await unbook(learner, e.id)
    expect(res.body.data.booked).toBe(false)
    expect(zoomMock().meetings.get(e.zoom.meetingId!)!.registrants.size).toBe(0)
  })

  it("won't book a draft or a finished event", async () => {
    const draft = (await create({ title: `${T} draft`, startsAt: at(3000), status: 'draft' })).body.data
    expect((await book(learner, draft.id)).status).toBe(404)
    expect((await mine(learner, draft.id))).toBeUndefined()
    const past = (await create({ title: `${T} past`, startsAt: at(-180) })).body.data
    expect((await book(learner, past.id)).status).toBe(409)
    expect((await book(learner, 'not-a-uuid')).status).toBe(404)
  })
})

describe('reminders and changes', () => {
  it('reminds booked learners 24 hours and 1 hour before, once each; email copies stay off by default', async () => {
    const e = (await create({ title: `${T} reminders`, startsAt: at(20 * 60), format: 'link', meetingLink: 'https://meet.example.com/rem' })).body.data
    await book(learner, e.id)
    const sent: Array<{ template: string; context?: Record<string, unknown> }> = []
    const real = reminderDeps.sendMail
    reminderDeps.sendMail = async (opts) => {
      sent.push(opts as never)
    }
    try {
      await sendEventReminders()
      await sendEventReminders()
      expect((await notes(learner, `Coming up: ${T} reminders`)).length).toBe(1)
      expect((await notes(other, `Coming up: ${T} reminders`)).length).toBe(0)
      expect(sent.length).toBe(0)

      // An hour before: a second reminder, and with emails switched on, one copy carrying the link.
      process.env['REMINDER_EMAILS_ENABLED'] = 'true'
      const soon = new Date(Date.parse(e.startsAt) - 50 * 60_000)
      await sendEventReminders(soon)
      await sendEventReminders(soon)
      const oneHour = await notes(learner, `Starting soon: ${T} reminders`)
      expect(oneHour.length).toBe(1)
      expect(oneHour[0]!.dedupeKey).toBe(`event:${e.id}:${Date.parse(e.startsAt)}:reminder:1h`)
      expect(sent.filter((m) => m.template === 'event-reminder').length).toBe(1)
      expect(sent[0]!.context?.['joinUrl']).toBe('https://meet.example.com/rem')
    } finally {
      delete process.env['REMINDER_EMAILS_ENABLED']
      reminderDeps.sendMail = real
    }
  })

  it('tells booked learners when the time changes, once, and re-arms the reminders', async () => {
    const e = (await create({ title: `${T} moved`, startDate: '2031-05-01', startTime: '17:00' })).body.data
    await book(learner, e.id)
    const move = { startDate: '2031-05-02', startTime: '18:30' }
    expect((await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: move })).status).toBe(200)
    await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: move })
    await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { description: 'Same time, new words' } })
    const changed = await notes(learner, `New time: ${T} moved`)
    expect(changed.length).toBe(1)
    expect(changed[0]!.type).toBe('event_changed')
    expect((await notes(other, `New time: ${T} moved`)).length).toBe(0)
    // A new length is a change too.
    await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { durationMinutes: 120 } })
    expect((await notes(learner, `New time: ${T} moved`)).length).toBe(2)
  })

  it('tells booked learners when an event is cancelled or taken down', async () => {
    const del = (await create({ title: `${T} deleted`, startsAt: at(3000), format: 'zoom' })).body.data
    await book(learner, del.id)
    expect((await api('DELETE', `/api/live-events/${del.id}`, { token: admin.token })).status).toBe(200)
    expect((await notes(learner, `Cancelled: ${T} deleted`)).length).toBe(1)
    expect((await notes(other, `Cancelled: ${T} deleted`)).length).toBe(0)
    expect(zoomMock().meetings.has(del.zoom.meetingId!)).toBe(false)

    const down = (await create({ title: `${T} unpublished`, startsAt: at(3000) })).body.data
    await book(other, down.id)
    await api('PATCH', `/api/live-events/${down.id}`, { token: admin.token, body: { status: 'draft' } })
    expect((await notes(other, `Cancelled: ${T} unpublished`)).length).toBe(1)
  })
})

describe('Zoom', () => {
  it('saves the event anyway when Zoom fails, and the sweep fixes it later', async () => {
    zoomMock().failNext = new ZoomError('server', 'boom')
    const res = await create({ title: `${T} zoom down`, startsAt: at(3000), format: 'zoom' })
    expect(res.status).toBe(201)
    expect(res.body.data.zoom.status).toBe('failed')
    expect(res.body.data.zoom.error).toBeTruthy()
    await reconcileZoom()
    const [row] = await db.select().from(liveEvents).where(eq(liveEvents.id, res.body.data.id))
    expect(row!.zoomStatus).toBe('active')
    expect(row!.zoomMeetingId).toBeTruthy()
  })

  it('moves the Zoom meeting with the event, and removes it when the event stops being Zoom', async () => {
    const e = (await create({ title: `${T} zoom move`, startsAt: at(3000), format: 'zoom' })).body.data
    await api('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { startDate: '2031-01-15', startTime: '10:00', timezone: 'Asia/Dubai' } })
    expect(zoomMock().meetings.get(e.zoom.meetingId!)!.startsAt.toISOString()).toBe('2031-01-15T06:00:00.000Z')
    const res = await api<{ data: Admin }>('PATCH', `/api/live-events/${e.id}`, { token: admin.token, body: { format: 'link', meetingLink: 'https://meet.example.com/x' } })
    expect(res.body.data.zoom.status).toBe('not_required')
    expect(res.body.data.zoom.meetingId).toBeNull()
    expect(zoomMock().meetings.has(e.zoom.meetingId!)).toBe(false)
  })

  it('gives admins the host link fresh from Zoom, and nobody else', async () => {
    const e = (await create({ title: `${T} host`, startsAt: at(3000), format: 'zoom' })).body.data
    const res = await api<{ data: { url: string } }>('GET', `/api/live-events/${e.id}/zoom/start-url`, { token: admin.token })
    expect(res.body.data.url).toContain('zoom.us/s/')
    expect((await api('GET', `/api/live-events/${e.id}/zoom/start-url`, { token: learner.token })).status).toBe(403)
    const [row] = await db.select().from(liveEvents).where(eq(liveEvents.id, e.id))
    expect(JSON.stringify(row)).not.toContain('zoom.us/s/')
  })

  it("reads Zoom's attendance report and exports the bookings", async () => {
    const e = (await create({ title: `${T} attended`, startsAt: at(10), format: 'zoom' })).body.data
    const view = (await book(learner, e.id)).body.data
    const registrantId = new URL(view.meetingLink!).searchParams.get('tk')!
    zoomMock().reports.set(e.zoom.meetingId!, [
      { registrantId, name: 'Test ev-learner', email: learner.email, joinedAt: new Date(), leftAt: null, durationSeconds: 2400 },
      { registrantId: null, name: 'Guest Speaker', email: null, joinedAt: new Date(), leftAt: null, durationSeconds: 3000 },
    ])
    expect(await syncAttendance(e.id)).toBe(true)
    const res = await api<{ data: { bookings: { email: string; attendedMinutes: number | null }[]; guests: { name: string }[] } }>(
      'GET',
      `/api/live-events/${e.id}/bookings`,
      { token: admin.token },
    )
    expect(res.body.data.bookings.find((b) => b.email === learner.email)?.attendedMinutes).toBe(40)
    expect(res.body.data.guests.map((g) => g.name)).toContain('Guest Speaker')
    const csv = await fetch(`${base}/api/live-events/${e.id}/bookings/export?format=csv`, { headers: { Origin: ORIGIN, Cookie: admin.token } })
    expect(csv.status).toBe(200)
    expect(await csv.text()).toContain(learner.email)
  })

  it('groups joins per person and matches them to bookings', () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 10, m))
    const rows = groupSessions(
      [
        { registrantId: 'r1', name: 'Amal', email: 'amal@x.com', joinedAt: t(0), leftAt: t(20), durationSeconds: 1200 },
        { registrantId: 'r1', name: 'Amal', email: 'amal@x.com', joinedAt: t(25), leftAt: t(55), durationSeconds: 1800 },
        { registrantId: null, name: 'Host', email: null, joinedAt: t(0), leftAt: t(60), durationSeconds: 3600 },
      ],
      [{ userId: 'u1', registrantId: 'r1', email: 'amal@x.com' }],
    )
    expect(rows.find((r) => r.userId === 'u1')).toMatchObject({ minutes: 50 })
    expect(rows.find((r) => r.name === 'Host')).toMatchObject({ userId: null, minutes: 60 })
  })
})

describe('Zoom webhook', () => {
  const send = (body: object, secret = SECRET, ts = String(Math.floor(Date.now() / 1000))) => {
    const raw = JSON.stringify(body)
    const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`
    return fetch(`${base}/api/webhooks/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zm-signature': sig, 'x-zm-request-timestamp': ts },
      body: raw,
    })
  }

  it('answers the URL validation challenge', async () => {
    const res = await send({ event: 'endpoint.url_validation', payload: { plainToken: 'abc' } })
    const body = (await res.json()) as { plainToken: string; encryptedToken: string }
    expect(body.plainToken).toBe('abc')
    expect(body.encryptedToken).toBe(createHmac('sha256', SECRET).update('abc').digest('hex'))
  })

  it('marks the event live when the meeting starts, and refuses a bad or old signature', async () => {
    const e = (await create({ title: `${T} webhook`, startsAt: at(3000), format: 'zoom' })).body.data
    const started = { event: 'meeting.started', payload: { object: { id: e.zoom.meetingId } } }
    expect((await send(started, 'wrong')).status).toBe(401)
    expect((await send(started, SECRET, '1000')).status).toBe(401)
    expect((await send(started)).status).toBe(200)
    const [after] = await db.select().from(liveEvents).where(eq(liveEvents.id, e.id))
    expect(after!.zoomStartedAt).not.toBeNull()
  })
})
