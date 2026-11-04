import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '../db'
import {
  users,
  learningBlocks,
  units,
  modules,
  courses,
  courseEnrollments,
  mentorAvailabilitySlots,
  mentorSessions,
} from '../db/schema'
import { eq, inArray } from 'drizzle-orm'
import {
  startTestServer,
  stopTestServer,
  api,
  createTestUser,
  cleanupFixtureUsers,
  type TestUser,
} from './helpers'

/**
 * Redesign features (ported from SMEEP f3d9a06): learning streak, course
 * topics, mentor notes, mentor photo upload, sessions needing completion,
 * admin "Needs attention".
 *
 * Builds its own small published course for the streak check and removes it
 * afterwards.
 */

let baseUrl: string
let learner: TestUser
let mentor: TestUser
let otherMentor: TestUser
let admin: TestUser
let mentorToken: string
let otherMentorToken: string
let adminToken: string
const slotIds: string[] = []
const uploadedFiles: string[] = []
const fixture = { course: '', block: '' }

/** Books a session for `smeId` with `mentorId` on a slot that ended an hour ago. */
async function pastConfirmedSession(mentorId: string, smeId: string, hoursAgo: number): Promise<string> {
  const startsAt = new Date(Date.now() - (hoursAgo + 1) * 3_600_000)
  const endsAt = new Date(Date.now() - hoursAgo * 3_600_000)
  const [slot] = await db
    .insert(mentorAvailabilitySlots)
    .values({ mentorUserId: mentorId, startsAt, endsAt, isAvailable: false })
    .returning()
  slotIds.push(slot!.id)
  const [session] = await db
    .insert(mentorSessions)
    .values({ slotId: slot!.id, mentorUserId: mentorId, smeUserId: smeId })
    .returning()
  return session!.id
}

beforeAll(async () => {
  baseUrl = await startTestServer()
  learner = await createTestUser('streak')
  mentor = await createTestUser('mentor', 'mentor')
  otherMentor = await createTestUser('mentor2', 'mentor')
  admin = await createTestUser('admin', 'admin')
  mentorToken = mentor.token
  otherMentorToken = otherMentor.token
  adminToken = admin.token

  const [course] = await db.insert(courses).values({ title: 'E2E streak course', status: 'published' }).returning()
  const [mod] = await db.insert(modules).values({ courseId: course!.id, title: 'Module' }).returning()
  const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: 'Unit', order: 0 }).returning()
  const [block] = await db.insert(learningBlocks).values({ unitId: unit!.id, type: 'text', title: 'Read', body: 'Hello', order: 0 }).returning()
  fixture.course = course!.id
  fixture.block = block!.id
})

afterAll(async () => {
  // mentor_sessions.*_user_id are ON DELETE RESTRICT, so remove our sessions
  // and slots before the fixture users.
  if (slotIds.length) {
    await db.delete(mentorSessions).where(inArray(mentorSessions.slotId, slotIds))
    await db.delete(mentorAvailabilitySlots).where(inArray(mentorAvailabilitySlots.id, slotIds))
  }
  for (const f of uploadedFiles) await fs.unlink(f).catch(() => {})
  if (fixture.course) {
    await db.delete(courseEnrollments).where(eq(courseEnrollments.courseId, fixture.course))
    await db.delete(courses).where(eq(courses.id, fixture.course))
  }
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('learning streak', () => {
  it('starts empty, with a Monday-to-Sunday week', async () => {
    const res = await api<{ data: { currentStreak: number; todaySteps: number; dailyGoal: number; week: { date: string; done: boolean }[] } }>(
      'GET', '/api/me/streak', { token: learner.token },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.currentStreak).toBe(0)
    expect(res.body.data.todaySteps).toBe(0)
    expect(res.body.data.dailyGoal).toBe(1)
    expect(res.body.data.week).toHaveLength(7)
    expect(new Date(`${res.body.data.week[0]!.date}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('counts a newly completed block once, in the learner timezone', async () => {
    await db.update(users).set({ timezone: 'Pacific/Kiritimati' }).where(eq(users.id, learner.id))
    expect((await api('POST', `/api/lms/courses/${fixture.course}/enroll`, { token: learner.token })).status).toBeLessThan(300)

    const complete = () => api('POST', `/api/lms/learning-blocks/${fixture.block}/progress`, {
      token: learner.token, body: { status: 'completed' },
    })
    expect((await complete()).status).toBe(200)
    // Re-completing the same block is not a new step.
    expect((await complete()).status).toBe(200)

    const res = await api<{ data: { currentStreak: number; longestStreak: number; todaySteps: number; week: { date: string; done: boolean }[] } }>(
      'GET', '/api/me/streak', { token: learner.token },
    )
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    expect(res.body.data.todaySteps).toBe(1)
    expect(res.body.data.currentStreak).toBe(1)
    expect(res.body.data.longestStreak).toBe(1)
    expect(res.body.data.week.find((d) => d.date === today)?.done).toBe(true)
  })

  it('requires auth', async () => {
    expect((await api('GET', '/api/me/streak')).status).toBe(401)
  })
})

describe('course topics', () => {
  it('learner course list carries category', async () => {
    const res = await api<{ data: Array<{ category: string | null }> }>('GET', '/api/lms/courses', { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    for (const c of res.body.data) expect('category' in c).toBe(true)
  })

  it('admin create/update accept a valid topic and keep other fields on a partial PATCH', async () => {
    const created = await api<{ data: { id: string; category: string | null; status: string } }>('POST', '/api/lms/admin/courses', {
      token: adminToken,
      body: { title: 'E2E topic course', status: 'published', category: 'Digital and AI' },
    })
    expect(created.status).toBe(201)
    expect(created.body.data.category).toBe('Digital and AI')
    const id = created.body.data.id
    try {
      const patched = await api<{ data: { category: string | null; status: string } }>('PATCH', `/api/lms/admin/courses/${id}`, {
        token: adminToken,
        body: { category: 'Money and finance' },
      })
      expect(patched.status).toBe(200)
      expect(patched.body.data.category).toBe('Money and finance')
      expect(patched.body.data.status).toBe('published')

      const cleared = await api<{ data: { category: string | null } }>('PATCH', `/api/lms/admin/courses/${id}`, {
        token: adminToken,
        body: { category: null },
      })
      expect(cleared.body.data.category).toBeNull()

      const bad = await api('PATCH', `/api/lms/admin/courses/${id}`, { token: adminToken, body: { category: 'Cooking' } })
      expect(bad.status).toBe(422)
    } finally {
      await api('DELETE', `/api/lms/admin/courses/${id}`, { token: adminToken })
    }
  })
})

describe('mentor sessions needing completion and notes', () => {
  let sessionId: string

  beforeAll(async () => {
    sessionId = await pastConfirmedSession(mentor.id, learner.id, 1)
  })

  it('returns ended confirmed sessions in past with needsCompletion', async () => {
    const res = await api<{ upcoming: unknown[]; past: Array<{ id: string; needsCompletion: boolean; mentorNotes: string | null; smeUser: { id: string } }> }>(
      'GET', '/api/mentor/sessions', { token: mentorToken },
    )
    expect(res.status).toBe(200)
    const s = res.body.past.find((p) => p.id === sessionId)
    expect(s?.needsCompletion).toBe(true)
    expect(s?.mentorNotes).toBeNull()
    expect(s?.smeUser.id).toBe(learner.id)

    const analytics = await api<{ sessionsNeedingCompletion: number }>('GET', '/api/mentor/analytics', { token: mentorToken })
    expect(analytics.body.sessionsNeedingCompletion).toBe(1)
  })

  it('admin needs-attention counts it; non-admins are refused', async () => {
    const res = await api<{ data: { mentorSessionsNeedingCompletion: number; unusedInviteCodes: unknown[]; draftCourses: number } }>(
      'GET', '/api/admin/needs-attention', { token: adminToken },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.mentorSessionsNeedingCompletion).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(res.body.data.unusedInviteCodes)).toBe(true)
    expect((await api('GET', '/api/admin/needs-attention', { token: learner.token })).status).toBe(403)
    expect((await api('GET', '/api/admin/needs-attention', { token: mentorToken })).status).toBe(403)
    expect((await api('GET', '/api/admin/needs-attention')).status).toBe(401)
  })

  it('saves session notes for the owning mentor only', async () => {
    const ok = await api<{ data: { id: string; mentorNotes: string } }>('PATCH', `/api/mentor/sessions/${sessionId}/notes`, {
      token: mentorToken, body: { notes: 'Discussed pricing.' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toEqual({ id: sessionId, mentorNotes: 'Discussed pricing.' })

    expect((await api('PATCH', `/api/mentor/sessions/${sessionId}/notes`, { token: otherMentorToken, body: { notes: 'x' } })).status).toBe(403)
    expect((await api('PATCH', `/api/mentor/sessions/${sessionId}/notes`, { token: learner.token, body: { notes: 'x' } })).status).toBe(403)
    expect((await api('PATCH', `/api/mentor/sessions/not-a-uuid/notes`, { token: mentorToken, body: { notes: 'x' } })).status).toBe(404)
    expect((await api('PATCH', `/api/mentor/sessions/${sessionId}/notes`, { token: mentorToken, body: {} })).status).toBe(422)

    const list = await api<{ past: Array<{ id: string; mentorNotes: string | null }> }>('GET', '/api/mentor/sessions', { token: mentorToken })
    expect(list.body.past.find((p) => p.id === sessionId)?.mentorNotes).toBe('Discussed pricing.')
  })

  it('keeps mentee notes per mentor, own mentees only', async () => {
    const empty = await api<{ data: { menteeId: string; notes: string; updatedAt: string | null } }>(
      'GET', `/api/mentor/mentees/${learner.id}/notes`, { token: mentorToken },
    )
    expect(empty.status).toBe(200)
    expect(empty.body.data).toEqual({ menteeId: learner.id, notes: '', updatedAt: null })

    const saved = await api<{ data: { notes: string; updatedAt: string | null } }>('PUT', `/api/mentor/mentees/${learner.id}/notes`, {
      token: mentorToken, body: { notes: 'Runs a bakery.' },
    })
    expect(saved.status).toBe(200)
    expect(saved.body.data.notes).toBe('Runs a bakery.')
    expect(saved.body.data.updatedAt).not.toBeNull()

    const again = await api<{ data: { notes: string } }>('GET', `/api/mentor/mentees/${learner.id}/notes`, { token: mentorToken })
    expect(again.body.data.notes).toBe('Runs a bakery.')

    expect((await api('GET', `/api/mentor/mentees/${learner.id}/notes`, { token: otherMentorToken })).status).toBe(404)
    expect((await api('PUT', `/api/mentor/mentees/${learner.id}/notes`, { token: learner.token, body: { notes: 'x' } })).status).toBe(403)
  })

  it('existing complete endpoint works on a session needing completion', async () => {
    const res = await api('PATCH', `/api/mentor/sessions/${sessionId}/complete`, { token: mentorToken })
    expect(res.status).toBe(200)
    const list = await api<{ past: Array<{ id: string; status: string; needsCompletion: boolean }> }>('GET', '/api/mentor/sessions', { token: mentorToken })
    const s = list.body.past.find((p) => p.id === sessionId)
    expect(s?.status).toBe('completed')
    expect(s?.needsCompletion).toBe(false)
  })

  it('keeps a session in progress in upcoming, not needing completion', async () => {
    const id = await pastConfirmedSession(mentor.id, learner.id, -0.5) // ends in 30 minutes
    const res = await api<{ upcoming: Array<{ id: string; needsCompletion: boolean }>; past: Array<{ id: string }> }>(
      'GET', '/api/mentor/sessions', { token: mentorToken },
    )
    expect(res.body.upcoming.find((u) => u.id === id)?.needsCompletion).toBe(false)
    expect(res.body.past.some((p) => p.id === id)).toBe(false)
    await api('PATCH', `/api/mentor/sessions/${id}/complete`, { token: mentorToken })
  })

  it('existing cancel endpoint works on a session needing completion', async () => {
    const id = await pastConfirmedSession(mentor.id, learner.id, 3)
    const res = await api('PATCH', `/api/mentor/sessions/${id}/cancel`, { token: mentorToken })
    expect(res.status).toBe(200)
    const list = await api<{ past: Array<{ id: string; status: string; needsCompletion: boolean }> }>('GET', '/api/mentor/sessions', { token: mentorToken })
    expect(list.body.past.find((p) => p.id === id)?.status).toBe('cancelled')
  })
})

describe('mentor photo upload', () => {
  // 1x1 transparent PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )

  async function upload(token: string | undefined, body: Buffer, type: string, name = 'me.png') {
    const form = new FormData()
    form.append('photo', new Blob([new Uint8Array(body)], { type }), name)
    const res = await fetch(`${baseUrl}/api/mentor/profile/photo`, {
      method: 'POST',
      // Connection: close so a rejected (413) upload doesn't leave a
      // half-sent keep-alive socket that blocks stopTestServer().
      headers: { Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    })
    return { status: res.status, body: (await res.json().catch(() => null)) as { data?: { avatarUrl: string } } | null }
  }

  it('stores the photo, sets avatar_url and serves it', async () => {
    const res = await upload(mentorToken, PNG, 'image/png')
    expect(res.status).toBe(201)
    const url = res.body!.data!.avatarUrl
    expect(url).toMatch(/\/uploads\/media\/avatar-.+\.png$/)
    const file = path.join(import.meta.dir, '..', 'uploads', 'media', url.split('/').pop()!)
    uploadedFiles.push(file)
    // Written where the built server's /uploads static route serves from
    // (server/uploads). Under `bun test` index.ts runs from source, whose
    // static root differs, so check the file on disk rather than over HTTP.
    expect((await fs.readFile(file)).equals(PNG)).toBe(true)

    const me = await api<{ data?: { avatarUrl: string }; avatarUrl?: string }>('GET', '/api/auth/me', { token: mentorToken })
    expect(JSON.stringify(me.body)).toContain(url)
  })

  it('rejects non-images, oversize files and non-mentors', async () => {
    expect((await upload(mentorToken, Buffer.from('<svg/>'), 'image/png')).status).toBe(415)
    expect((await upload(mentorToken, PNG, 'image/gif', 'a.gif')).status).toBe(415)
    expect((await upload(mentorToken, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')).status).toBe(413)
    // Role check runs before the body is read; send no body so Bun's test
    // server isn't left holding an unread multipart stream.
    const asLearner = await fetch(`${baseUrl}/api/mentor/profile/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${learner.token}` },
    })
    expect(asLearner.status).toBe(403)
    expect((await upload(undefined, PNG, 'image/png')).status).toBe(401)
  })
})
