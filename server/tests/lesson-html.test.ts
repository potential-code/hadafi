import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, learningBlocks } from '../db/schema'
import { cleanLessonBody } from '../utils/lessonHtml'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Lesson bodies saved in the admin course editor are cleaned on the server
 * (DOMPurify, the same rules the site renders with), so a stored body can't
 * carry script whatever displays it. Markdown bodies are kept as written.
 */

let admin: TestUser
let courseId = ''
let unitId = ''

const DIRTY = [
  '<p>Count <strong>every</strong> cost.</p>',
  '<script>alert(1)</script>',
  '<img src="x" onerror="alert(2)">',
  '<a href="javascript:alert(3)">click</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<p onclick="alert(4)" style="color:red">styled</p>',
].join('')

function expectClean(html: string) {
  expect(html).toContain('<p>Count <strong>every</strong> cost.</p>')
  expect(html).toContain('styled')
  for (const bad of ['<script', 'alert(', 'onerror', 'onclick', 'javascript:', '<iframe']) expect(html).not.toContain(bad)
}

beforeAll(async () => {
  await startTestServer()
  admin = await createTestUser('lesson-html-admin', 'admin')
  const [c] = await db.insert(courses).values({ title: 'E2E lesson html', status: 'draft' }).returning()
  courseId = c!.id
  const [m] = await db.insert(modules).values({ courseId, title: 'Module' }).returning()
  const [u] = await db.insert(units).values({ moduleId: m!.id, title: 'Unit' }).returning()
  unitId = u!.id
})

afterAll(async () => {
  await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const stored = async (id: string) => (await db.select({ body: learningBlocks.body }).from(learningBlocks).where(eq(learningBlocks.id, id)))[0]!.body

describe('cleanLessonBody', () => {
  it('cleans HTML and keeps Markdown, null and empty as they are', async () => {
    expectClean(await cleanLessonBody(DIRTY))
    const markdown = '> A quote & a **bold** word, 3 < 5\n\n- item'
    expect(await cleanLessonBody(markdown)).toBe(markdown)
    expect(await cleanLessonBody(null)).toBeNull()
    expect(await cleanLessonBody(undefined)).toBeUndefined()
    expect(await cleanLessonBody('')).toBe('')
  })
})

describe('the admin course editor', () => {
  it('stores a cleaned body when a block is created', async () => {
    const res = await api<{ data: { id: string; body: string } }>('POST', `/api/lms/admin/units/${unitId}/blocks`, {
      token: admin.token, body: { type: 'text', title: 'Costs', body: DIRTY },
    })
    expect(res.status).toBe(201)
    expectClean(res.body.data.body)
    expectClean((await stored(res.body.data.id))!)
  })

  it('stores a cleaned body when a block is edited, and leaves the body alone when it is not sent', async () => {
    const created = await api<{ data: { id: string } }>('POST', `/api/lms/admin/units/${unitId}/blocks`, {
      token: admin.token, body: { type: 'text', title: 'Plain', body: '<p>fine</p>' },
    })
    const id = created.body.data.id
    expect((await api('PATCH', `/api/lms/admin/blocks/${id}`, { token: admin.token, body: { body: DIRTY } })).status).toBe(200)
    const after = (await stored(id))!
    expectClean(after)
    expect((await api('PATCH', `/api/lms/admin/blocks/${id}`, { token: admin.token, body: { title: 'Renamed' } })).status).toBe(200)
    expect(await stored(id)).toBe(after)
  })
})
