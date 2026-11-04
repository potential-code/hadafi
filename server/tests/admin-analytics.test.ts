import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { courses, courseEnrollments, userCourseProgress } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Admin course completion (ported from SMEEP 009fa5e): completion comes from
 * user_course_progress.completed_at. Enrollment status is never moved to
 * 'completed', so counting it showed 0% for every course.
 *
 * Builds a published course with four enrolled learners: one finished today,
 * one finished 60 days ago, two still learning. All enrollments keep status
 * 'active', as they do in the real app.
 */

let admin: TestUser
let learner: TestUser
let courseId = ''

beforeAll(async () => {
  await startTestServer()
  admin = await createTestUser('analytics-admin', 'admin')
  learner = await createTestUser('analytics-learner')
  const learners = [learner, ...(await Promise.all([1, 2, 3].map((i) => createTestUser(`analytics-l${i}`))))]

  const [course] = await db.insert(courses).values({ title: 'E2E completion course', status: 'published' }).returning()
  courseId = course!.id
  await db.insert(courseEnrollments).values(learners.map((l) => ({ userId: l.id, courseId })))
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000)
  await db.insert(userCourseProgress).values([
    { userId: learners[0]!.id, courseId, progressPercentage: 100, completedAt: new Date() },
    { userId: learners[1]!.id, courseId, progressPercentage: 100, completedAt: sixtyDaysAgo },
    { userId: learners[2]!.id, courseId, progressPercentage: 40 },
  ])
})

afterAll(async () => {
  // Enrollments and progress cascade with the course.
  if (courseId) await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

type CompletionRow = { courseId: string; totalEnrolled: number; completed: number; completionRate: number }
type PerformanceRow = { courseId: string; enrolled: number; completionRate: number }

describe('admin course completion', () => {
  it('course performance counts learners whose course progress is completed', async () => {
    const res = await api<{ data: PerformanceRow[] }>('GET', '/api/admin/analytics/course-performance', { token: admin.token })
    expect(res.status).toBe(200)
    const row = res.body.data.find((r) => r.courseId === courseId)
    expect(row).toBeDefined()
    expect(row!.enrolled).toBe(4)
    expect(row!.completionRate).toBe(50)
  })

  it('course completion rates are scoped to completions inside the range', async () => {
    const year = await api<{ data: CompletionRow[] }>('GET', '/api/admin/analytics/course-completion?range=12m', { token: admin.token })
    expect(year.status).toBe(200)
    const y = year.body.data.find((r) => r.courseId === courseId)
    expect(y).toBeDefined()
    expect(y!.totalEnrolled).toBe(4)
    expect(y!.completed).toBe(2)
    expect(y!.completionRate).toBe(50)

    const month = await api<{ data: CompletionRow[] }>('GET', '/api/admin/analytics/course-completion?range=30d', { token: admin.token })
    const m = month.body.data.find((r) => r.courseId === courseId)
    expect(m!.completed).toBe(1)
    expect(m!.completionRate).toBe(25)
  })

  it('is for admins only', async () => {
    expect((await api('GET', '/api/admin/analytics/course-completion', { token: learner.token })).status).toBe(403)
    expect((await api('GET', '/api/admin/analytics/course-performance')).status).toBe(401)
  })
})
