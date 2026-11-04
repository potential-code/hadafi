import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'fs'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '../db'
import {
  courseCertificates, courseEnrollments, courses, liveEvents, mentorAvailabilitySlots, mentorSessions,
  notifications, userCourseProgress,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { notify } from '../services/notifications.service'
import { issueCertificate } from '../services/lms/certificate.service'
import { reminderDeps, reminderEmailsEnabled, runReminders } from '../services/reminders.service'

/**
 * Notifications (the bell): notify() and its dedupe, the bell API (each user
 * sees and changes only her own), the triggers (sessions, certificates,
 * events), and the reminder timer's session reminders and course nudges,
 * each sent once, with reminder emails off unless switched on.
 */

let learner: TestUser
let other: TestUser
let mentor: TestUser
let admin: TestUser
let courseId = ''
const EVENT_TITLE = `E2E notif event ${Date.now()}`

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null }
type List = { data: { items: Item[]; unread: number } }
const list = (token: string) => api<List>('GET', '/api/me/notifications', { token })
const mine = (userId: string, type: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, type)))
const settle = () => new Promise((r) => setTimeout(r, 300))

/** A confirmed session between the test mentor and a learner, starting `minutes` from now. */
async function confirmedSession(smeUserId: string, minutes: number) {
  const startsAt = new Date(Date.now() + minutes * 60_000)
  const [slot] = await db
    .insert(mentorAvailabilitySlots)
    .values({ mentorUserId: mentor.id, startsAt, endsAt: new Date(+startsAt + 3_600_000), isAvailable: false })
    .returning()
  const [session] = await db
    .insert(mentorSessions)
    .values({ slotId: slot!.id, mentorUserId: mentor.id, smeUserId, status: 'confirmed' })
    .returning()
  return session!
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('notif')
  other = await createTestUser('notif-other')
  mentor = await createTestUser('notif-mentor', 'mentor')
  admin = await createTestUser('notif-admin', 'admin')
  const [course] = await db.insert(courses).values({ title: 'E2E notifications course', status: 'published' }).returning()
  courseId = course!.id
})

afterAll(async () => {
  const events = await db.select({ id: liveEvents.id }).from(liveEvents).where(like(liveEvents.title, `${EVENT_TITLE}%`))
  // Publishing the test event notified every learner in this database.
  await db.delete(notifications).where(like(notifications.title, `%${EVENT_TITLE}%`))
  if (events.length) await db.delete(liveEvents).where(inArray(liveEvents.id, events.map((e) => e.id)))
  const certs = await db.select().from(courseCertificates).where(eq(courseCertificates.courseId, courseId))
  for (const c of certs) if (c.filePath) fs.rmSync(c.filePath, { force: true })
  await db.delete(courses).where(eq(courses.id, courseId))
  await db.delete(mentorSessions).where(eq(mentorSessions.mentorUserId, mentor.id))
  await db.delete(mentorAvailabilitySlots).where(eq(mentorAvailabilitySlots.mentorUserId, mentor.id))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('notify()', () => {
  it('creates one per user and skips a repeated dedupe key', async () => {
    expect(await notify(learner.id, { type: 'certificate', title: 'Test one', dedupeKey: 'test:one' })).toBe(1)
    expect(await notify(learner.id, { type: 'certificate', title: 'Test one again', dedupeKey: 'test:one' })).toBe(0)
    // The same key for another user is a separate notification.
    expect(await notify([learner.id, other.id], { type: 'certificate', title: 'Test shared', dedupeKey: 'test:shared' })).toBe(2)
    // No key: every call creates one.
    expect(await notify(learner.id, { type: 'certificate', title: 'Test two' })).toBe(1)
    const rows = await mine(learner.id, 'certificate')
    expect(rows.filter((n) => n.title.startsWith('Test')).map((n) => n.title).sort()).toEqual(['Test one', 'Test shared', 'Test two'])
  })

  it('never throws into the caller', async () => {
    // An unknown user breaks the foreign key: logged, nothing created, no throw.
    expect(await notify('00000000-0000-0000-0000-000000000000', { type: 'certificate', title: 'Nobody' })).toBe(0)
    expect(await notify([], { type: 'certificate', title: 'Nobody' })).toBe(0)
  })
})

describe('the bell API', () => {
  it('lists, counts unread and marks read, for the owner only', async () => {
    let res = await list(learner.token)
    expect(res.status).toBe(200)
    const unread = res.body.data.unread
    expect(unread).toBeGreaterThanOrEqual(3)
    const count = await api<{ data: { unread: number } }>('GET', '/api/me/notifications/unread-count', { token: learner.token })
    expect(count.body.data.unread).toBe(unread)

    const first = res.body.data.items.find((n) => n.title === 'Test two')!
    // Someone else neither sees it nor can mark it.
    const othersList = await list(other.token)
    expect(othersList.body.data.items.some((n) => n.id === first.id)).toBe(false)
    expect((await api('POST', `/api/me/notifications/${first.id}/read`, { token: other.token })).status).toBe(404)
    expect((await list(learner.token)).body.data.unread).toBe(unread)

    expect((await api('POST', `/api/me/notifications/${first.id}/read`, { token: learner.token })).status).toBe(200)
    res = await list(learner.token)
    expect(res.body.data.unread).toBe(unread - 1)
    expect(res.body.data.items.find((n) => n.id === first.id)!.readAt).not.toBeNull()

    // Mark all read touches only the caller's own.
    const otherUnread = (await list(other.token)).body.data.unread
    await api('POST', '/api/me/notifications/read-all', { token: learner.token })
    expect((await list(learner.token)).body.data.unread).toBe(0)
    expect((await list(other.token)).body.data.unread).toBe(otherUnread)
  })

  it('answers 404 for an id that is not a notification', async () => {
    expect((await api('POST', '/api/me/notifications/not-a-uuid/read', { token: learner.token })).status).toBe(404)
    expect((await api('POST', '/api/me/notifications/00000000-0000-0000-0000-000000000000/read', { token: learner.token })).status).toBe(404)
  })

  it('needs a signed-in user', async () => {
    expect((await api('GET', '/api/me/notifications', {})).status).toBe(401)
    expect((await api('GET', '/api/me/notifications/unread-count', {})).status).toBe(401)
    expect((await api('POST', '/api/me/notifications/read-all', {})).status).toBe(401)
  })

  it('works for mentors and admins too', async () => {
    expect((await list(mentor.token)).status).toBe(200)
    expect((await list(admin.token)).status).toBe(200)
  })
})

describe('triggers', () => {
  it('a booked session notifies both sides; a cancellation notifies the other side', async () => {
    const startsAt = new Date(Date.now() + 3 * 86_400_000)
    const [slot] = await db
      .insert(mentorAvailabilitySlots)
      .values({ mentorUserId: mentor.id, startsAt, endsAt: new Date(+startsAt + 3_600_000) })
      .returning()
    const booked = await api('POST', '/api/sessions', {
      token: learner.token,
      body: { slotId: slot!.id },
    })
    expect([200, 201]).toContain(booked.status)
    await settle()
    expect((await mine(learner.id, 'session_booked')).length).toBe(1)
    const mentorBooked = await mine(mentor.id, 'session_booked')
    expect(mentorBooked.length).toBe(1)
    expect(mentorBooked[0]!.link).toBe('/mentor/dashboard/sessions')

    const [session] = await db.select().from(mentorSessions).where(eq(mentorSessions.slotId, slot!.id))
    expect((await api('PATCH', `/api/sessions/${session!.id}/cancel`, { token: learner.token })).status).toBe(200)
    await settle()
    expect((await mine(mentor.id, 'session_cancelled')).length).toBe(1)
    expect((await mine(learner.id, 'session_cancelled')).length).toBe(0)
  })

  it('an issued certificate notifies the learner', async () => {
    await db.insert(courseEnrollments).values({ userId: other.id, courseId })
    const cert = await issueCertificate(other.id, courseId)
    await settle()
    const rows = await mine(other.id, 'certificate')
    const earned = rows.find((n) => n.dedupeKey === `certificate:${cert.id}`)
    expect(earned?.title).toBe('You earned a certificate: E2E notifications course')
    expect(earned?.link).toBe('/dashboard/certificates')
  })

  it('a newly published upcoming event notifies learners once, and so does its replay', async () => {
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    const created = await api<{ data: { id: string } }>('POST', '/api/live-events', {
      token: admin.token,
      body: { title: EVENT_TITLE, type: 'Webinar', date, time: '5:00 PM / GST', status: 'draft' },
    })
    expect([200, 201]).toContain(created.status)
    const id = created.body.data.id
    await settle()
    const titled = async (title: string) => (await list(learner.token)).body.data.items.filter((n) => n.title === title)
    expect((await titled(`New event: ${EVENT_TITLE}`)).length).toBe(0)

    await api('PATCH', `/api/live-events/${id}`, { token: admin.token, body: { status: 'published' } })
    await settle()
    await api('PATCH', `/api/live-events/${id}`, { token: admin.token, body: { description: 'Edited' } })
    await settle()
    expect((await titled(`New event: ${EVENT_TITLE}`)).length).toBe(1)
    // Mentors and admins aren't learners.
    expect((await list(mentor.token)).body.data.items.some((n) => n.title === `New event: ${EVENT_TITLE}`)).toBe(false)

    await api('PATCH', `/api/live-events/${id}`, { token: admin.token, body: { recordingLink: 'https://example.com/replay' } })
    await settle()
    await api('PATCH', `/api/live-events/${id}`, { token: admin.token, body: { description: 'Edited again' } })
    await settle()
    expect((await titled(`Replay available: ${EVENT_TITLE}`)).length).toBe(1)
  })
})

describe('reminders', () => {
  it('reminder emails are off unless REMINDER_EMAILS_ENABLED=true', () => {
    const saved = process.env['REMINDER_EMAILS_ENABLED']
    delete process.env['REMINDER_EMAILS_ENABLED']
    expect(reminderEmailsEnabled()).toBe(false)
    process.env['REMINDER_EMAILS_ENABLED'] = 'false'
    expect(reminderEmailsEnabled()).toBe(false)
    process.env['REMINDER_EMAILS_ENABLED'] = 'true'
    expect(reminderEmailsEnabled()).toBe(true)
    if (saved === undefined) delete process.env['REMINDER_EMAILS_ENABLED']
    else process.env['REMINDER_EMAILS_ENABLED'] = saved
  })

  it('reminds both sides of a session within the hour, once, and sends no email by default', async () => {
    const saved = process.env['REMINDER_EMAILS_ENABLED']
    delete process.env['REMINDER_EMAILS_ENABLED']
    const realSend = reminderDeps.sendMail
    const sent: string[] = []
    reminderDeps.sendMail = async (opts) => {
      sent.push(opts.to)
    }
    try {
      const session = await confirmedSession(learner.id, 50)
      await runReminders()
      const learnerHas = (await mine(learner.id, 'session_reminder')).filter((n) => n.dedupeKey === `session:${session.id}:reminder:1h`)
      const mentorHas = (await mine(mentor.id, 'session_reminder')).filter((n) => n.dedupeKey === `session:${session.id}:reminder:1h`)
      expect(learnerHas.length).toBe(1)
      expect(learnerHas[0]!.title).toContain('starts soon')
      expect(learnerHas[0]!.link).toBe('/dashboard/sessions')
      expect(mentorHas.length).toBe(1)
      expect(mentorHas[0]!.link).toBe('/mentor/dashboard/sessions')

      await runReminders()
      expect((await mine(learner.id, 'session_reminder')).filter((n) => n.dedupeKey === `session:${session.id}:reminder:1h`).length).toBe(1)
      expect(sent).not.toContain(learner.email)
      expect(sent).not.toContain(mentor.email)
    } finally {
      reminderDeps.sendMail = realSend
      if (saved !== undefined) process.env['REMINDER_EMAILS_ENABLED'] = saved
    }
  })

  it('sends the reminder email copy only with REMINDER_EMAILS_ENABLED=true', async () => {
    const saved = process.env['REMINDER_EMAILS_ENABLED']
    process.env['REMINDER_EMAILS_ENABLED'] = 'true'
    const realSend = reminderDeps.sendMail
    const sent: { to: string; template: string }[] = []
    reminderDeps.sendMail = async (opts) => {
      sent.push({ to: opts.to, template: opts.template })
    }
    try {
      const session = await confirmedSession(other.id, 20 * 60) // tomorrow-ish: the 24 h reminder
      await runReminders()
      const has = (await mine(other.id, 'session_reminder')).filter((n) => n.dedupeKey === `session:${session.id}:reminder:24h`)
      expect(has.length).toBe(1)
      expect(sent).toContainEqual({ to: other.email, template: 'session-reminder' })
      expect(sent).toContainEqual({ to: mentor.email, template: 'session-reminder' })
      // A second run creates nothing new, so it sends no second email.
      const before = sent.length
      await runReminders()
      expect(sent.filter((s) => s.to === other.email).length).toBe(1)
      expect(sent.length).toBeGreaterThanOrEqual(before)
    } finally {
      reminderDeps.sendMail = realSend
      if (saved === undefined) delete process.env['REMINDER_EMAILS_ENABLED']
      else process.env['REMINDER_EMAILS_ENABLED'] = saved
    }
  })

  it('nudges a learner idle for a week on an unfinished course, once a week', async () => {
    const idle = await createTestUser('notif-idle')
    await db.insert(userCourseProgress).values({
      userId: idle.id,
      courseId,
      progressPercentage: 30,
      updatedAt: new Date(Date.now() - 10 * 86_400_000),
    })
    await runReminders()
    await runReminders()
    const nudges = await mine(idle.id, 'course_nudge')
    expect(nudges.length).toBe(1)
    expect(nudges[0]!.link).toBe(`/dashboard/courses/${courseId}`)
    expect(nudges[0]!.title).toBe('Pick up E2E notifications course where you left off')
  })

  it('does not nudge a learner who learned recently', async () => {
    const active = await createTestUser('notif-active')
    await db.insert(userCourseProgress).values({ userId: active.id, courseId, progressPercentage: 30 })
    await runReminders()
    expect((await mine(active.id, 'course_nudge')).length).toBe(0)
  })
})
