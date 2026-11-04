import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { strFromU8, unzipSync } from 'fflate'
import { db } from '../db'
import { users, courses, assessments, assessmentAttempts } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, ORIGIN, type TestUser } from './helpers'

/**
 * Admin reports (ported from SMEEP 9c89f63, 09045cd, 205bf7a):
 * GET /api/admin/analytics/impact, /analytics/insights, /analytics/learning-gain
 * and /exports/:dataset. Admins only; exports open as real spreadsheets.
 */

let base = ''
let admin: TestUser
let learner: TestUser
let courseId = ''
let preId = ''
let postId = ''

beforeAll(async () => {
  base = await startTestServer()
  admin = await createTestUser('reports-admin', 'admin')
  learner = await createTestUser('reports-learner')
  // A name a spreadsheet would run as a formula, and a company to find the row by.
  await db.update(users).set({ fullName: '=HYPERLINK("http://x","Click")', company: 'Noor Bakery' }).where(eq(users.id, learner.id))

  const [course] = await db.insert(courses).values({ title: 'E2E learning gain course', status: 'published' }).returning()
  courseId = course!.id
  const [pre, post] = await db
    .insert(assessments)
    .values([
      { courseId, title: 'Pre-test', assessmentType: 'pre' },
      { courseId, title: 'Final exam', assessmentType: 'post' },
    ])
    .returning()
  preId = pre!.id
  postId = post!.id
})

afterAll(async () => {
  // Assessments and attempts cascade with the course.
  if (courseId) await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const download = (dataset: string, format: string, token = admin.token) =>
  fetch(`${base}/api/admin/exports/${dataset}?format=${format}`, { headers: { Origin: ORIGIN, Cookie: token } })

/** Reads the first sheet of an .xlsx back into rows of text (shared strings resolved). */
function readXlsx(bytes: Uint8Array): { rows: string[][]; sheet: string } {
  const files = unzipSync(bytes)
  const sheetNames = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
  expect(sheetNames).toHaveLength(1)
  const sheet = strFromU8(files[sheetNames[0]!]!)
  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        [...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => t[1]!)
          .join('')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&'),
      )
    : []
  const rows = [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
    [...r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
      const attrs = c[1] ?? ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1] ?? ''
      return /\bt="s"/.test(attrs) ? (shared[Number(v)] ?? '') : v
    }),
  )
  return { rows, sheet }
}

describe('admin reports access', () => {
  const paths = [
    '/api/admin/analytics/impact',
    '/api/admin/analytics/insights?range=7d',
    '/api/admin/analytics/learning-gain',
    '/api/admin/exports/learners?format=csv',
  ]
  for (const path of paths) {
    it(`${path} is admins only`, async () => {
      expect((await api('GET', path)).status).toBe(401)
      expect((await api('GET', path, { token: learner.token })).status).toBe(403)
      expect((await api('GET', path, { token: admin.token })).status).toBe(200)
    })
  }
})

describe('impact dashboard', () => {
  it('counts learners, countries and learning outcomes', async () => {
    const res = await api<{
      data: {
        summary: Record<string, number | null>
        monthly: { month: string }[]
        uses: { label: string; learners: number }[]
        countries: { country: string; learners: number }[]
      }
    }>('GET', '/api/admin/analytics/impact', { token: admin.token })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.summary.learners).toBeGreaterThanOrEqual(1)
    expect(d.monthly).toHaveLength(12)
    expect(d.monthly[11]!.month).toBe(new Date().toISOString().slice(0, 7))
    expect(d.uses.map((u) => u.label)).toEqual(['Courses', 'Pre-tests', 'Final exams', 'Mentor sessions', 'Partner offers', 'AI Examiner'])
    // Test learners sign up with the ISO code "AE": it is folded into the country's name.
    expect(d.countries.some((c) => c.country === 'United Arab Emirates')).toBe(true)
    expect(d.countries.some((c) => c.country === 'AE')).toBe(false)
  })
})

describe('analytics insights', () => {
  type Insights = {
    range: string
    kpis: Record<string, { current: number; previous: number }>
    series: { bucket: string }[]
    funnel: { step: string; learners: number }[]
  }

  it('compares each KPI with the previous period', async () => {
    const get = async () => (await api<{ data: Insights }>('GET', '/api/admin/analytics/insights?range=7d', { token: admin.token })).body.data
    const before = await get()
    expect(before.range).toBe('7d')
    expect(before.series).toHaveLength(7)
    expect(before.series[6]!.bucket).toBe(new Date().toISOString().slice(0, 10))
    expect(before.funnel[0]!.step).toBe('Registered')

    // Joined ten days ago: in the previous 7 days, not this week.
    const other = await createTestUser('reports-earlier')
    await db.update(users).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(users.id, other.id))
    const after = await get()
    expect(after.kpis.newLearners!.previous).toBe(before.kpis.newLearners!.previous + 1)
  })

  it('falls back to 30 days for an unknown range', async () => {
    const res = await api<{ data: Insights }>('GET', '/api/admin/analytics/insights?range=forever', { token: admin.token })
    expect(res.status).toBe(200)
    expect(res.body.data.range).toBe('30d')
    expect(res.body.data.series).toHaveLength(30)
  })
})

describe('learning gain', () => {
  it('compares the first pre-test with the best final exam', async () => {
    const before = (await api<{ data: { pairs: number } }>('GET', '/api/admin/analytics/learning-gain', { token: admin.token })).body.data.pairs
    const t = Date.now()
    await db.insert(assessmentAttempts).values([
      { userId: learner.id, assessmentId: preId, attemptNumber: 1, score: 40, passed: false, completedAt: new Date(t - 3_000) },
      { userId: learner.id, assessmentId: preId, attemptNumber: 2, score: 90, passed: true, completedAt: new Date(t - 2_000) },
      { userId: learner.id, assessmentId: postId, attemptNumber: 1, score: 70, passed: true, completedAt: new Date(t - 1_000) },
      { userId: learner.id, assessmentId: postId, attemptNumber: 2, score: 85, passed: true, completedAt: new Date(t) },
    ])

    const res = await api<{ data: { pairs: number; courses: { courseId: string; learners: number; avgPre: number; avgPost: number; avgGain: number }[] } }>(
      'GET',
      '/api/admin/analytics/learning-gain',
      { token: admin.token },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.pairs).toBe(before + 1)
    const course = res.body.data.courses.find((c) => c.courseId === courseId)
    // First pre-test (40, not the later 90) vs best final exam (85).
    expect(course).toEqual({ courseId, course: 'E2E learning gain course', learners: 1, avgPre: 40, avgPost: 85, avgGain: 45 } as never)

    const text = await (await download('learning-gain', 'csv')).text()
    const row = text.split('\r\n').find((l) => l.includes(learner.email))
    expect(row).toContain(',40,85,45,')
  })
})

describe('admin exports', () => {
  it('404s for an unknown dataset', async () => {
    expect((await download('passwords', 'csv')).status).toBe(404)
  })

  for (const dataset of ['learners', 'course-progress', 'learning-gain', 'certificates', 'redemptions', 'mentor-sessions']) {
    it(`exports ${dataset} as CSV and Excel`, async () => {
      const csv = await download(dataset, 'csv')
      expect(csv.status).toBe(200)
      expect(csv.headers.get('content-type')).toContain('text/csv')
      expect(csv.headers.get('content-disposition')).toContain(`hadafi-${dataset}-`)
      expect(csv.headers.get('cache-control')).toBe('no-store')
      const header = (await csv.text()).replace(/^﻿/, '').split('\r\n')[0]!

      const xlsx = await download(dataset, 'xlsx')
      expect(xlsx.status).toBe(200)
      expect(xlsx.headers.get('content-type')).toContain('spreadsheetml')
      const { rows, sheet } = readXlsx(new Uint8Array(await xlsx.arrayBuffer()))
      // The same header row as the CSV, frozen, with filter dropdowns when there is data.
      expect(rows[0]!.join(',')).toBe(header)
      expect(sheet).toContain('state="frozen"')
      if (rows.length > 1) expect(sheet).toMatch(/<autoFilter ref="A1:[A-Z]+1"\/>/)
      expect(Number(xlsx.headers.get('x-row-count'))).toBe(rows.length - 1)
    })
  }

  it('opens the learners spreadsheet with the learner on a row, formulas kept as text', async () => {
    const { rows } = readXlsx(new Uint8Array(await (await download('learners', 'xlsx')).arrayBuffer()))
    expect(rows[0]!.slice(0, 4)).toEqual(['Name', 'Email', 'Company', 'Country'])
    const row = rows.find((r) => r.includes(learner.email))
    expect(row).toBeDefined()
    expect(row![0]).toBe(`'=HYPERLINK("http://x","Click")`)
    expect(row![2]).toBe('Noor Bakery')
    expect(row![3]).toBe('United Arab Emirates')
  })

  it('keeps names that look like formulas as text in CSV, with a BOM for Excel', async () => {
    const bytes = new Uint8Array(await (await download('learners', 'csv')).arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const row = new TextDecoder().decode(bytes).split('\r\n').find((l) => l.includes(learner.email))
    expect(row).toBeDefined()
    expect(row!.startsWith(`"'=HYPERLINK`)).toBe(true)
    expect(row).toContain('Noor Bakery')
  })

  it('never lists admins as learners', async () => {
    const text = await (await download('learners', 'csv')).text()
    expect(text).not.toContain(admin.email)
  })
})
