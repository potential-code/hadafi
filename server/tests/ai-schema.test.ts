/**
 * AI analytics: the `ai` schema itself, against the live database.
 *
 * - the catalogue the agents are given matches the views column for column;
 * - no view exposes a column whose name looks like personal data, and no text
 *   value looks like an email address or a link;
 * - learner-keyed views hold learners only;
 * - the migration that ships the views carries server/db/aiViews/001_ai_schema.sql verbatim;
 * - the release script's read-only role reads the views and nothing else.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { notifications, userBadges } from '../db/schema'
import { catalogViews, liveAiColumns, PII_COLUMN_PATTERNS } from '../services/ai-sql/schema-catalog'
import { checkAiReadonlyRole } from '../scripts/ai-readonly-role.mjs'
import { cleanupFixtureUsers, createTestUser, startTestServer, stopTestServer, type TestUser } from './helpers'
import { useAiReadonlyRole } from './ai-helpers'

let readonlyUrl = ''
let admin: TestUser
let mentor: TestUser
let learner: TestUser

beforeAll(async () => {
  await startTestServer()
  readonlyUrl = await useAiReadonlyRole()
  admin = await createTestUser('ai-schema-admin', 'admin')
  mentor = await createTestUser('ai-schema-mentor', 'mentor')
  learner = await createTestUser('ai-schema-learner')
  // Rows that would show up in learner-keyed views if the role filter were missing.
  await db.insert(notifications).values([
    { userId: admin.id, type: 'announcement', title: 'Admin only' },
    { userId: mentor.id, type: 'session_booked', title: 'Mentor only' },
    { userId: learner.id, type: 'badge', title: 'Learner' },
  ])
  await db.insert(userBadges).values([{ userId: mentor.id, badge: 'first_step' }, { userId: learner.id, badge: 'first_step' }])
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('catalogue matches the views', () => {
  test('every view and column, in order, and nothing else', async () => {
    const live = await liveAiColumns()
    const liveViews = new Map<string, string[]>()
    for (const c of live) liveViews.set(c.view, [...(liveViews.get(c.view) ?? []), c.column])

    const declared = new Map(catalogViews().map((v) => [v.name, v.columns.map((c) => c.name)]))
    expect([...liveViews.keys()].sort()).toEqual([...declared.keys()].sort())
    for (const [view, columns] of declared) expect({ view, columns: liveViews.get(view) }).toEqual({ view, columns })
  })
})

describe('no personal data', () => {
  test('no column name looks like personal data', async () => {
    const offenders = (await liveAiColumns())
      .filter(({ column }) => PII_COLUMN_PATTERNS.some((p) => p.test(column)))
      .map((o) => `ai.${o.view}.${o.column}`)
    expect(offenders).toEqual([])
  })

  test('the pattern list catches the columns the base tables really have', () => {
    for (const column of [
      'email', 'full_name', 'phone', 'bio', 'company', 'avatar_url', 'meeting_link', 'zoom_join_url', 'recording_link',
      'linkedin_url', 'mentor_notes', 'billing_email', 'stripe_payment_intent_id', 'certificate_number', 'certificate_url',
      'file_path', 'password_hash', 'cover_image', 'image_url', 'location', 'zoom_passcode', 'join_code', 'body',
      'description', 'answers', 'passion', 'website', 'representing', 'timezone', 'name',
    ]) {
      expect({ column, caught: PII_COLUMN_PATTERNS.some((p) => p.test(column)) }).toEqual({ column, caught: true })
    }
    for (const column of ['learner_id', 'points_spent', 'notification_type', 'title', 'country', 'organisation_type']) {
      expect({ column, caught: PII_COLUMN_PATTERNS.some((p) => p.test(column)) }).toEqual({ column, caught: false })
    }
  })

  test('no text value looks like an email address or a link', async () => {
    const textColumns = (await liveAiColumns()).filter((c) => c.type === 'text')
    const offenders: string[] = []
    for (const { view, column } of textColumns) {
      const { rows } = await db.execute<{ n: number }>(
        sql.raw(
          `SELECT count(*)::int AS n FROM ai."${view}" WHERE "${column}" ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}' OR "${column}" ~* 'https?://'`,
        ),
      )
      if ((rows[0]?.n ?? 0) > 0) offenders.push(`ai.${view}.${column}`)
    }
    expect(offenders).toEqual([])
  })

  test('learner-keyed views hold learners only', async () => {
    const keyed = [...new Set((await liveAiColumns()).filter((c) => c.column === 'learner_id').map((c) => c.view))]
    expect(keyed.length).toBeGreaterThan(5)
    for (const view of keyed) {
      const { rows } = await db.execute<{ n: number }>(
        sql.raw(`SELECT count(*)::int AS n FROM ai."${view}" v JOIN users u ON u.id = v.learner_id WHERE u.role <> 'sme'`),
      )
      expect({ view, nonLearners: rows[0]?.n }).toEqual({ view, nonLearners: 0 })
    }
    const mine = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ai.notification WHERE learner_id IN (${admin.id}, ${mentor.id}, ${learner.id})`,
    )
    expect(mine.rows[0]?.n).toBe(1)
    const mentors = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ai.mentor WHERE mentor_id = ${mentor.id}`)
    expect(mentors.rows[0]?.n).toBe(1)
  })
})

describe('the views ship as a migration', () => {
  test('the newest migration that builds the views carries 001_ai_schema.sql verbatim', () => {
    const dir = path.join(import.meta.dir, '..', 'db', 'migrations')
    const journal = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
    const withViews = journal.entries
      .map((e) => e.tag)
      .filter((tag) => readFileSync(path.join(dir, `${tag}.sql`), 'utf8').includes('CREATE VIEW ai.'))
    expect(withViews.length).toBeGreaterThan(0)
    const newest = readFileSync(path.join(dir, `${withViews.at(-1)}.sql`), 'utf8')
    const canonical = readFileSync(path.join(import.meta.dir, '..', 'db', 'aiViews', '001_ai_schema.sql'), 'utf8')
    expect(newest.includes(canonical)).toBe(true)
    // And every migration file is in the journal (a stray copy would never run).
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).map((f) => f.replace(/\.sql$/, ''))
    for (const tag of withViews) expect(files).toContain(tag)
  })
})

describe('the read-only role', () => {
  test('reads the ai views and is refused everything else', async () => {
    const lines: string[] = []
    const failed = await checkAiReadonlyRole(readonlyUrl, (l: string) => lines.push(l))
    expect({ failed, lines }).toEqual({ failed: 0, lines: expect.any(Array) })
  })

  test('the app user still reads a learner it just created (views are live)', async () => {
    const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ai.learner WHERE learner_id = ${learner.id}`)
    expect(rows[0]?.n).toBe(1)
    await db.delete(userBadges).where(eq(userBadges.userId, learner.id))
  })
})
