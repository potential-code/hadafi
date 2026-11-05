import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  courseCertificates, courses, learnerActivityDays, mentorAvailabilitySlots, mentorSessions, modules,
  notifications, pointsEvents, units, userBadges, users,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { awardPointsForUnit } from '../services/lms/progress.service'
import { recordLearningStep } from '../services/streak.service'
import { completeSession } from '../services/mentor_sessions.service'
import { checkBadges, displayName } from '../services/achievements.service'

/**
 * Achievements: points history, the leaderboard (points earned, first name +
 * initial, opt out, never an email) and badges (earned on the server from
 * real events, stored once, one bell notification, each learner sees only
 * her own), plus the quiet backfill in migration 0024.
 */

const PTS = 15
let top: TestUser
let viewer: TestUser
let mentor: TestUser
let courseId = ''
let unitId = ''
const settle = () => new Promise((r) => setTimeout(r, 400))

type Entry = { rank: number; name: string; initials: string; avatarUrl: string | null; points: number; badges: number; isYou: boolean }
type Board = { data: { period: string; entries: Entry[]; you: { rank: number; points: number } | null; hidden: boolean; total: number } }
type Badge = { key: string; earnedAt: string | null; progress: { current: number; target: number } }
type Achievements = { data: { balance: number; earned: number; showOnLeaderboard: boolean; badges: Badge[] } }
const board = (token: string, period = 'week') => api<Board>('GET', `/api/me/leaderboard?period=${period}`, { token })
const achievements = (token: string, query = '') => api<Achievements>('GET', `/api/me/achievements${query}`, { token })
const badgesOf = (userId: string) => db.select().from(userBadges).where(eq(userBadges.userId, userId))
const badgeBells = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'badge')))

/** The badge backfill statement of migration 0024 (its last statement). */
function backfillSql(): string {
  const file = path.join(import.meta.dir, '../db/migrations/0024_achievements.sql')
  const parts = fs.readFileSync(file, 'utf8').split('--> statement-breakpoint')
  return parts[parts.length - 1]!
}

beforeAll(async () => {
  await startTestServer()
  top = await createTestUser('top')
  viewer = await createTestUser('viewer')
  mentor = await createTestUser('mentor-ach', 'mentor')
  const [course] = await db.insert(courses).values({ title: 'E2E achievements course', status: 'published', pointsPerUnit: PTS }).returning()
  courseId = course!.id
  const [mod] = await db.insert(modules).values({ courseId, title: 'Module' }).returning()
  const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: 'Unit' }).returning()
  unitId = unit!.id
})

afterAll(async () => {
  await db.delete(mentorSessions).where(eq(mentorSessions.mentorUserId, mentor.id))
  await db.delete(mentorAvailabilitySlots).where(eq(mentorAvailabilitySlots.mentorUserId, mentor.id))
  await db.delete(courseCertificates).where(eq(courseCertificates.courseId, courseId))
  await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('points', () => {
  it('awards a unit once, however often it is completed', async () => {
    await Promise.all([awardPointsForUnit(top.id, courseId, unitId), awardPointsForUnit(top.id, courseId, unitId)])
    await awardPointsForUnit(top.id, courseId, unitId)
    const [u] = await db.select({ points: users.points }).from(users).where(eq(users.id, top.id))
    expect(u!.points).toBe(PTS)
    expect((await db.select().from(pointsEvents).where(eq(pointsEvents.userId, top.id))).length).toBe(1)
  })
})

describe('leaderboard', () => {
  it('ranks by points earned and shows only a first name and initial, never an email', async () => {
    // Make sure the fixture is in the top 10 whatever else is in this database.
    await db.insert(pointsEvents).values({ userId: top.id, reason: 'test', ref: 'boost', amount: 1_000_000 })
    const mine = (await board(top.token)).body.data
    expect(mine.you?.rank).toBe(1)
    expect(mine.entries[0]).toMatchObject({ name: 'Test T.', initials: 'TT', isYou: true, points: 1_000_000 + PTS })

    const res = await board(viewer.token)
    expect(res.status).toBe(200)
    const seen = res.body.data
    expect(seen.entries[0]).toMatchObject({ name: 'Test T.', isYou: false })
    expect(seen.you).toBeNull()
    const raw = JSON.stringify(res.body)
    expect(raw).not.toContain(top.email)
    expect(raw).not.toContain('@')
    expect(raw).not.toContain(top.id)
    expect(Object.keys(seen.entries[0]!).sort()).toEqual(['avatarUrl', 'badges', 'initials', 'isYou', 'name', 'points', 'rank'])
  })

  it('does not drop a rank when points are spent', async () => {
    await db.update(users).set({ points: 0 }).where(eq(users.id, top.id))
    expect((await board(top.token, 'all')).body.data.you?.points).toBe(1_000_000 + PTS)
  })

  it('hides a learner who opts out from everyone else, but still shows her own place', async () => {
    const off = await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: false } })
    expect(off.status).toBe(200)
    for (const period of ['week', 'month', 'all']) {
      const seen = (await board(viewer.token, period)).body.data
      expect(seen.entries.some((e) => e.name === 'Test T.' && e.points > 1_000_000)).toBe(false)
    }
    const mine = (await board(top.token)).body.data
    expect(mine.hidden).toBe(true)
    expect(mine.you?.rank).toBe(1)
    expect((await achievements(top.token)).body.data.showOnLeaderboard).toBe(false)
    await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: true } })
    expect((await board(viewer.token)).body.data.entries[0]?.name).toBe('Test T.')
  })

  it('lists only learners, never mentors or admins', async () => {
    await db.insert(pointsEvents).values({ userId: mentor.id, reason: 'test', ref: 'boost', amount: 2_000_000 })
    const seen = (await board(viewer.token, 'all')).body.data
    expect(seen.entries.some((e) => e.points >= 2_000_000)).toBe(false)
  })

  it('rejects a bad visibility value and falls back to a month for an unknown period', async () => {
    expect((await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: 'yes' } })).status).toBe(422)
    expect((await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: false, userId: viewer.id } })).status).toBe(422)
    const res = await api<Board>('GET', '/api/me/leaderboard?period=forever', { token: top.token })
    expect(res.body.data.period).toBe('month')
  })

  it('is for signed-in learners only', async () => {
    expect((await api('GET', '/api/me/leaderboard')).status).toBe(401)
    expect((await api('GET', '/api/me/leaderboard', { token: mentor.token })).status).toBe(403)
    expect((await api('GET', '/api/me/achievements', { token: mentor.token })).status).toBe(403)
    expect((await api('PUT', '/api/me/leaderboard-visibility', { token: mentor.token, body: { show: false } })).status).toBe(403)
  })

  it('shortens names', () => {
    expect(displayName('Mariam Al Hashimi')).toBe('Mariam H.')
    expect(displayName('  Fatima  ')).toBe('Fatima')
    expect(displayName('')).toBe('Learner')
  })
})

describe('badges', () => {
  it('earns a badge from a real learning step, once, and rings the bell once', async () => {
    expect((await badgesOf(viewer.id)).length).toBe(0)
    await recordLearningStep(viewer.id)
    await settle()
    const first = (await achievements(viewer.token)).body.data
    expect(first.badges.find((b) => b.key === 'first_step')?.earnedAt).not.toBeNull()
    expect(first.badges.find((b) => b.key === 'streak_7')).toMatchObject({ earnedAt: null, progress: { current: 1, target: 7 } })

    // Repeating the step, the check and the page can't award or notify again.
    await recordLearningStep(viewer.id)
    await Promise.all([checkBadges(viewer.id), checkBadges(viewer.id), checkBadges(viewer.id)])
    expect(await checkBadges(viewer.id)).toEqual([])
    await achievements(viewer.token)
    await settle()
    const stored = await badgesOf(viewer.id)
    expect(stored.map((b) => b.badge)).toEqual(['first_step'])
    const bells = await badgeBells(viewer.id)
    expect(bells.length).toBe(1)
    expect(bells[0]).toMatchObject({ title: 'New badge: First step', link: '/dashboard/achievements', dedupeKey: 'badge:first_step' })
  })

  it('does not award on page views: the page only reads', async () => {
    // Activity written straight to the table (no event): the page must not award it.
    const quiet = await createTestUser('quiet')
    await db.insert(learnerActivityDays).values({ userId: quiet.id, day: '2026-01-05', steps: 1 })
    const res = await achievements(quiet.token)
    expect(res.body.data.badges.find((b) => b.key === 'first_step')?.earnedAt).toBeNull()
    expect((await badgesOf(quiet.id)).length).toBe(0)
  })

  it('awards a certificate badge when a certificate is issued', async () => {
    const learner = await createTestUser('cert-ach')
    await db.insert(courseCertificates).values({ userId: learner.id, courseId, certificateNumber: `E2E-ACH-${Date.now()}` })
    // A certificate row alone isn't an event; the hook in issueCertificate runs checkBadges.
    expect(await checkBadges(learner.id)).toEqual(['course_1'])
    const list = (await achievements(learner.token)).body.data.badges
    expect(list.find((b) => b.key === 'course_3')).toMatchObject({ earnedAt: null, progress: { current: 1, target: 3 } })
  })

  it('awards the mentor badge when the mentor completes a session', async () => {
    const startsAt = new Date(Date.now() - 2 * 3_600_000)
    const [slot] = await db
      .insert(mentorAvailabilitySlots)
      .values({ mentorUserId: mentor.id, startsAt, endsAt: new Date(+startsAt + 3_600_000), isAvailable: false })
      .returning()
    const [session] = await db
      .insert(mentorSessions)
      .values({ slotId: slot!.id, mentorUserId: mentor.id, smeUserId: top.id, status: 'confirmed' })
      .returning()
    await completeSession(mentor.id, session!.id)
    await settle()
    expect((await badgesOf(top.id)).map((b) => b.badge)).toContain('mentored')
    expect((await badgeBells(top.id)).filter((n) => n.dedupeKey === 'badge:mentored').length).toBe(1)
  })

  it('shows each learner only her own badges', async () => {
    const res = await achievements(viewer.token, `?userId=${top.id}`)
    expect(res.status).toBe(200)
    const keys = res.body.data.badges.filter((b) => b.earnedAt).map((b) => b.key)
    expect(keys).toEqual(['first_step'])
    expect(keys).not.toContain('mentored')
    expect(JSON.stringify(res.body)).not.toContain(top.id)
  })

  it('gives mentors no badges', async () => {
    await recordLearningStep(mentor.id)
    await settle()
    expect(await checkBadges(mentor.id)).toEqual([])
    expect((await badgesOf(mentor.id)).length).toBe(0)
  })
})

describe('backfill (migration 0024)', () => {
  it('stores badges earned before this release, dated, quietly, and only once', async () => {
    const past = await createTestUser('past')
    const days = Array.from({ length: 8 }, (_, i) => `2026-03-${String(10 + i).padStart(2, '0')}`)
    await db.insert(learnerActivityDays).values(days.map((day) => ({ userId: past.id, day, steps: 2 })))
    await db.insert(courseCertificates).values({
      userId: past.id, courseId, certificateNumber: `E2E-PAST-${Date.now()}`, issuedAt: new Date('2026-04-01T09:00:00Z'),
    })
    // A mentor's activity earns nothing.
    await db.insert(learnerActivityDays).values({ userId: mentor.id, day: '2026-03-10', steps: 1 })

    await db.execute(sql.raw(backfillSql()))
    await db.execute(sql.raw(backfillSql()))

    const got = await db.select().from(userBadges).where(inArray(userBadges.userId, [past.id, mentor.id]))
    expect(got.map((b) => b.badge).sort()).toEqual(['course_1', 'first_step', 'streak_7'])
    // A date cast to a timestamp is midnight, read back in the process timezone.
    const at = (k: string) => {
      const d = got.find((b) => b.badge === k)!.earnedAt
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    expect(at('first_step')).toBe('2026-03-10')
    expect(at('streak_7')).toBe('2026-03-16')
    expect(at('course_1')).toBe('2026-04-01')
    expect((await badgeBells(past.id)).length).toBe(0)

    // Already stored: a later event finds nothing new to award or ring.
    expect(await checkBadges(past.id)).toEqual([])
  })
})
