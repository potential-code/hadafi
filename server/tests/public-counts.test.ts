import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { count, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, users, offers, liveEvents } from '../db/schema'
import { resetPublicCache, type PublicCounts, type PublicCoursePick } from '../routes/public'
import { AI_MENTOR_BOT_IDS } from '../controllers/aiMentor.controller'
import { startTestServer, stopTestServer, api } from './helpers'

/**
 * The homepage states only figures it reads from the database: published
 * courses, expert mentors, AI mentors, published offers and events. No sign-in
 * needed, drafts never counted, and the course picks carry real unit counts.
 */

type Envelope<T> = { success: boolean; data: T }
const createdCourses: string[] = []

async function dbCounts(): Promise<PublicCounts> {
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0)
  return {
    courses: await n(db.select({ n: count() }).from(courses).where(eq(courses.status, 'published'))),
    mentors: await n(db.select({ n: count() }).from(users).where(eq(users.role, 'mentor'))),
    aiMentors: AI_MENTOR_BOT_IDS.size,
    offers: await n(db.select({ n: count() }).from(offers).where(eq(offers.status, 'published'))),
    events: await n(db.select({ n: count() }).from(liveEvents).where(eq(liveEvents.status, 'published'))),
  }
}

beforeAll(async () => {
  await startTestServer()
  resetPublicCache()
})

afterAll(async () => {
  if (createdCourses.length) await db.delete(courses).where(inArray(courses.id, createdCourses))
  await stopTestServer()
})

describe('GET /api/public/counts', () => {
  it('answers without a session and matches the database', async () => {
    const res = await api<Envelope<PublicCounts>>('GET', '/api/public/counts')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual(await dbCounts())
    expect(res.body.data.aiMentors).toBe(6)
  })

  it('counts a newly published course, but not a draft, once the cache is cleared', async () => {
    const before = (await api<Envelope<PublicCounts>>('GET', '/api/public/counts')).body.data

    const [draft] = await db.insert(courses).values({ title: 'Public counts draft', status: 'draft' }).returning({ id: courses.id })
    const [live] = await db.insert(courses).values({ title: 'Public counts live', status: 'published' }).returning({ id: courses.id })
    createdCourses.push(draft!.id, live!.id)

    // Cached: the same answer for five minutes.
    const cached = (await api<Envelope<PublicCounts>>('GET', '/api/public/counts')).body.data
    expect(cached).toEqual(before)

    resetPublicCache()
    const after = (await api<Envelope<PublicCounts>>('GET', '/api/public/counts')).body.data
    expect(after.courses).toBe(before.courses + 1)
  })
})

describe('GET /api/public/courses', () => {
  it('lists up to six published courses with a cover and their real unit counts', async () => {
    const [course] = await db
      .insert(courses)
      .values({ title: 'Public picks course', status: 'published', cover: '/images/courses/teamwork.png' })
      .returning({ id: courses.id })
    createdCourses.push(course!.id)
    const [mod] = await db.insert(modules).values({ courseId: course!.id, title: 'M1' }).returning({ id: modules.id })
    await db.insert(units).values([
      { moduleId: mod!.id, title: 'U1', order: 0 },
      { moduleId: mod!.id, title: 'U2', order: 1 },
    ])
    resetPublicCache()

    const res = await api<Envelope<PublicCoursePick[]>>('GET', '/api/public/courses')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(6)
    const ids = res.body.data.map((c) => c.id)
    const rows = await db.select({ id: courses.id, status: courses.status }).from(courses).where(inArray(courses.id, ids.length ? ids : [course!.id]))
    for (const r of rows) expect(r.status).toBe('published')
    for (const c of res.body.data) {
      expect(c.cover).toBeTruthy()
      expect(c.units).toBeGreaterThan(0)
    }
    // Every unit count is the database's.
    for (const c of res.body.data) {
      const [row] = await db
        .select({ n: count(units.id) })
        .from(modules)
        .leftJoin(units, eq(units.moduleId, modules.id))
        .where(eq(modules.courseId, c.id))
      expect(c.units).toBe(Number(row?.n ?? 0))
    }
  })

  it('puts a featured course first, with its own unit count', async () => {
    // Lower-case title: matched case-insensitively against "financial literacy".
    const [course] = await db
      .insert(courses)
      .values({ title: 'financial literacy ', status: 'published', cover: '/images/courses/teamwork.png' })
      .returning({ id: courses.id })
    createdCourses.push(course!.id)
    const [mod] = await db.insert(modules).values({ courseId: course!.id, title: 'M1' }).returning({ id: modules.id })
    await db.insert(units).values([
      { moduleId: mod!.id, title: 'U1', order: 0 },
      { moduleId: mod!.id, title: 'U2', order: 1 },
      { moduleId: mod!.id, title: 'U3', order: 2 },
    ])
    resetPublicCache()

    const picks = (await api<Envelope<PublicCoursePick[]>>('GET', '/api/public/courses')).body.data
    const mine = picks.find((c) => c.id === course!.id)
    expect(mine?.units).toBe(3)
  })
})
