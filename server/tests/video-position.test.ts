import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, learningBlocks } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Course video resume (port of SMEEP 217b302): the player saves where the
 * learner is, so they pick up there on any device. Watched % only goes up, a
 * finished block stays finished, and only an enrolled learner of a published
 * course can save.
 */

let user: TestUser
let outsider: TestUser
let courseId: string
let videoBlockId: string
let textBlockId: string

type Saved = { success: boolean; data: { videoPositionSec: number; videoWatchPct: number } }
const save = (blockId: string, positionSec: number, watchPct: number, token = user.token) =>
  api<Saved>('PUT', `/api/lms/learning-blocks/${blockId}/video-position`, { token, body: { positionSec, watchPct } })

beforeAll(async () => {
  await startTestServer()
  user = await createTestUser('videopos')
  outsider = await createTestUser('videopos-outsider')
  const [course] = await db.insert(courses).values({ title: 'E2E video position course', status: 'published' }).returning()
  courseId = course!.id
  const [mod] = await db.insert(modules).values({ courseId, title: 'Module' }).returning()
  const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: 'Unit', order: 0 }).returning()
  const blocks = await db.insert(learningBlocks).values([
    { unitId: unit!.id, type: 'video', title: 'Watch', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 0 },
    { unitId: unit!.id, type: 'text', title: 'Read', body: 'Hello', order: 1 },
  ]).returning()
  videoBlockId = blocks[0]!.id
  textBlockId = blocks[1]!.id
  expect((await api('POST', `/api/lms/courses/${courseId}/enroll`, { token: user.token })).status).toBeLessThan(300)
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await db.delete(courses).where(inArray(courses.id, [courseId]))
  await stopTestServer()
})

describe('video position', () => {
  it('saves the position and watched %', async () => {
    const res = await save(videoBlockId, 42, 30)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ videoPositionSec: 42, videoWatchPct: 30 })
  })

  it('comes back with the course, for resume on another device', async () => {
    const res = await api<{ data: unknown }>('GET', `/api/lms/courses/${courseId}`, { token: user.token })
    expect(JSON.stringify(res.body)).toContain('"videoPositionSec":42')
  })

  it('moves the position back, but never lowers watched %', async () => {
    const res = await save(videoBlockId, 10, 12)
    expect(res.body.data).toEqual({ videoPositionSec: 10, videoWatchPct: 30 })
  })

  it('keeps a completed block completed', async () => {
    await api('POST', `/api/lms/learning-blocks/${videoBlockId}/progress`, { token: user.token, body: { status: 'completed', videoWatchPct: 95 } })
    expect((await save(videoBlockId, 5, 40)).status).toBe(200)
    const [row] = await db.query.userLearningBlockProgress.findMany({
      where: (p, { and }) => and(eq(p.userId, user.id), eq(p.learningBlockId, videoBlockId)),
    })
    expect(row?.status).toBe('completed')
    expect(row?.videoWatchPct).toBe(95)
  })

  it('refuses a block that is not a video', async () => {
    expect((await save(textBlockId, 5, 10)).status).toBe(404)
  })

  it('refuses a learner who is not enrolled', async () => {
    const res = await save(videoBlockId, 5, 10, outsider.token)
    expect(res.status).toBe(404)
  })

  it('rejects bad values', async () => {
    expect((await save(videoBlockId, -1, 10)).status).toBe(422)
    expect((await save(videoBlockId, 5, 101)).status).toBe(422)
  })

  it('needs a signed-in learner', async () => {
    expect((await save(videoBlockId, 5, 10, '')).status).toBe(401)
  })
})
