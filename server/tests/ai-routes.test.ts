/**
 * AI analytics routes (/api/admin/ai/*), ported from SMEEP: admin-only
 * access, "not set up" without the read-only role, the query path with its
 * guard, row cap and timeout, the role as the real boundary, report
 * downloads and saved dashboards.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { aiDashboards } from '../db/schema'
import { runReadOnlyQuery, withRowCap } from '../services/ai-sql/execute'
import { closeAiReadonlyPool } from '../services/ai-sql/readonly-pool'
import { MAX_ROWS } from '../services/ai-sql/limits'
import { api, cleanupFixtureUsers, createTestUser, ORIGIN, startTestServer, stopTestServer, type TestUser } from './helpers'
import { useAiReadonlyRole, withoutAiReadonlyRole } from './ai-helpers'

let baseUrl = ''
let learner: TestUser
let mentor: TestUser
let admin: TestUser
const createdBoards: string[] = []

beforeAll(async () => {
  baseUrl = await startTestServer()
  await useAiReadonlyRole()
  learner = await createTestUser('ai-learner')
  mentor = await createTestUser('ai-mentor', 'mentor')
  admin = await createTestUser('ai-admin', 'admin')
})

afterAll(async () => {
  for (const id of createdBoards) await db.delete(aiDashboards).where(eq(aiDashboards.id, id))
  await cleanupFixtureUsers()
  await closeAiReadonlyPool()
  await stopTestServer()
})

type ErrorBody = { success: false; error: { message: string; code: string; errors?: string[] } }
type QueryBody = {
  success: true
  data: { columns: string[]; columnTypes: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; elapsedMs: number }
}

type QueryOrError = { success: boolean; data: QueryBody['data']; error: ErrorBody['error'] }
const query = (sql: string, token = admin.token) => api<QueryOrError>('POST', '/api/admin/ai/query', { token, body: { sql } })

describe('access', () => {
  test('anonymous callers get 401; learners and mentors 403', async () => {
    for (const [method, path] of [
      ['GET', '/api/admin/ai/catalog'],
      ['POST', '/api/admin/ai/query'],
      ['POST', '/api/admin/ai/report'],
      ['GET', '/api/admin/ai/dashboards'],
      ['POST', '/api/admin/ai/dashboards'],
    ] as const) {
      const body = method === 'POST' ? { sql: 'SELECT count(*) FROM ai.learner' } : undefined
      expect({ path, status: (await api(method, path, { body })).status }).toEqual({ path, status: 401 })
      for (const user of [learner, mentor]) {
        expect({ path, role: user.role, status: (await api(method, path, { token: user.token, body })).status }).toEqual({
          path,
          role: user.role,
          status: 403,
        })
      }
    }
  })
})

describe('without AI_READONLY_DATABASE_URL', () => {
  test('the catalogue and queries say the feature is not set up; nothing runs on the main connection', async () => {
    await withoutAiReadonlyRole(async () => {
      const catalog = await api<ErrorBody>('GET', '/api/admin/ai/catalog', { token: admin.token })
      expect(catalog.status).toBe(503)
      expect(catalog.body.error.code).toBe('AI_READONLY_NOT_CONFIGURED')
      const res = await query('SELECT count(*) FROM ai.learner')
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('AI_READONLY_NOT_CONFIGURED')
    })
  })

  test('a connection that can do more than read ai is refused (503)', async () => {
    const saved = process.env['AI_READONLY_DATABASE_URL']
    // The app's own (superuser) connection, misconfigured as the read-only one.
    process.env['AI_READONLY_DATABASE_URL'] = process.env['DATABASE_URL']
    await closeAiReadonlyPool()
    try {
      const res = await query('SELECT count(*) FROM ai.learner')
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('AI_READONLY_ROLE_UNSAFE')
    } finally {
      process.env['AI_READONLY_DATABASE_URL'] = saved
      await closeAiReadonlyPool()
    }
  })
})

describe('catalog and query', () => {
  test('admins get the sql-1.2.0 catalogue', async () => {
    const res = await api<{ success: true; data: { version: string; schema: string; views: { name: string }[]; chartTypes: string[]; limits: { maxRows: number; statementTimeoutMs: number } } }>(
      'GET',
      '/api/admin/ai/catalog',
      { token: admin.token },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.version).toBe('sql-1.2.0')
    expect(res.body.data.schema).toBe('ai')
    expect(res.body.data.views.map((v) => v.name)).toContain('learner')
    expect(res.body.data.chartTypes).toContain('kpi')
    expect(res.body.data.limits).toEqual({ maxRows: 500, statementTimeoutMs: 15_000, maxQueriesPerTurn: 5 } as never)
  })

  test('a valid SELECT returns columns, types and rows', async () => {
    const res = await query('SELECT country, count(*) AS learners FROM ai.learner GROUP BY country ORDER BY learners DESC')
    expect(res.status).toBe(200)
    expect(res.body.data.columns).toEqual(['country', 'learners'])
    expect(res.body.data.columnTypes).toEqual(['text', 'bigint'])
    expect(res.body.data.rowCount).toBeGreaterThan(0)
    expect(res.body.data.truncated).toBe(false)
    expect(typeof res.body.data.elapsedMs).toBe('number')
    // createTestUser signs up from 'AE': the view folds the code into a name.
    expect(res.body.data.rows.some((row) => row[0] === 'United Arab Emirates')).toBe(true)
  })

  test('writes, several statements and other schemas are rejected before reaching the database', async () => {
    for (const [sql, expected] of [
      ['DELETE FROM ai.learner', 'Only SELECT'],
      ["UPDATE ai.course SET title = 'x'", 'Only SELECT'],
      ['DROP VIEW ai.learner', 'could not be parsed'],
      ['DROP TABLE users', 'Only SELECT'],
      ['WITH gone AS (DELETE FROM ai.learner RETURNING learner_id) SELECT count(*) FROM gone', 'DELETE'],
      ['SELECT count(*) FROM ai.learner; DELETE FROM users', 'exactly one statement'],
      ['SELECT email FROM users', 'users'],
      ['SELECT * FROM public.auth_accounts', 'public.auth_accounts'],
      ['SELECT * FROM pg_catalog.pg_authid', 'pg_catalog.pg_authid'],
      ['SELECT pg_sleep(20) FROM ai.learner', 'pg_sleep'],
    ] as const) {
      const res = await query(sql)
      expect({ sql, status: res.status, code: res.body.error?.code }).toEqual({ sql, status: 400, code: 'SQL_REJECTED' })
      expect(res.body.error.message).toContain(expected)
      expect(res.body.error.errors?.length).toBeGreaterThan(0)
    }
  })

  test('a Postgres error is a 400 the agent can act on', async () => {
    const res = await query('SELECT no_such_column FROM ai.learner')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SQL_FAILED')
    expect(res.body.error.message).toContain('no_such_column')
  })

  test('a missing sql body is a validation error', async () => {
    const res = await api<ErrorBody>('POST', '/api/admin/ai/query', { token: admin.token, body: {} })
    expect(res.status).toBe(422)
  })

  test(`results are capped at ${MAX_ROWS} rows and say they were truncated`, async () => {
    const res = await query(
      `SELECT g FROM ai.learner l CROSS JOIN generate_series(1, ${MAX_ROWS + 100}) g WHERE l.learner_id = '${learner.id}'`,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.rowCount).toBe(MAX_ROWS)
    expect(res.body.data.rows.length).toBe(MAX_ROWS)
    expect(res.body.data.truncated).toBe(true)

    const exact = await query(`SELECT g FROM ai.learner l CROSS JOIN generate_series(1, ${MAX_ROWS}) g WHERE l.learner_id = '${learner.id}'`)
    expect(exact.body.data.rowCount).toBe(MAX_ROWS)
    expect(exact.body.data.truncated).toBe(false)
  })
})

describe('the executor and the role (past the guard)', () => {
  const run = (text: string, timeoutMs?: number) => runReadOnlyQuery({ text: withRowCap(text), searchPath: 'ai', timeoutMs })

  test('queries run read-only, as the role, on the ai search path, with the 15 s timeout', async () => {
    const res = await run(
      "SELECT current_user AS who, current_setting('transaction_read_only') AS ro, current_setting('statement_timeout') AS timeout, current_setting('search_path') AS path FROM ai.learner LIMIT 1",
    )
    expect(res.rows[0]).toEqual(['hadafi_ai_readonly', 'on', '15s', 'ai'])
  })

  test('a slow query is cancelled at the timeout', async () => {
    const started = Date.now()
    const err = await run('SELECT pg_sleep(3) FROM ai.learner LIMIT 1', 300).catch((e: unknown) => e as { code?: string; statusCode?: number; message?: string })
    expect(err).toMatchObject({ code: 'SQL_TIMEOUT', statusCode: 400 })
    expect(Date.now() - started).toBeLessThan(2500)
  })

  test('even SQL the guard would refuse cannot read base tables or write', async () => {
    for (const sql of ['SELECT count(*) FROM public.users', 'SELECT count(*) FROM public.auth_accounts', 'SELECT count(*) FROM public.offer_redemptions']) {
      const err = (await run(sql).catch((e: unknown) => e)) as { code?: string; message?: string }
      expect({ sql, code: err.code }).toEqual({ sql, code: 'SQL_FAILED' })
      expect(err.message).toContain('permission denied')
    }
    const write = (await runReadOnlyQuery({ text: "CREATE TABLE public._ai_probe (i int)", searchPath: 'ai' }).catch((e: unknown) => e)) as { code?: string }
    expect(write.code).toBe('SQL_FAILED')
  })
})

describe('report', () => {
  const spec = {
    title: 'Learner activity',
    summary: 'Most learners are in the **United Arab Emirates** (Figure 1).',
    sections: [
      {
        heading: 'Where learners are',
        body: '- By country',
        figures: [
          {
            source: 'programme',
            number: 1,
            title: 'Learners by country',
            chart: 'bar',
            sql: 'SELECT country, count(*) AS learners FROM ai.learner GROUP BY country ORDER BY learners DESC',
          },
          {
            number: 2,
            title: 'Certificates by course',
            chart: 'table',
            sql: 'SELECT c.title, count(*) AS certificates FROM ai.certificate x JOIN ai.course c ON c.course_id = x.course_id GROUP BY c.title',
          },
        ],
      },
    ],
  }

  const download = (body: unknown, q = '') =>
    fetch(`${baseUrl}/api/admin/ai/report${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: admin.token },
      body: JSON.stringify(body),
    })

  test('PDF', async () => {
    const res = await download({ ...spec, format: 'pdf' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/filename="hadafi-report-\d{4}-\d{2}-\d{2}\.pdf"/)
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  test('XLSX, with the format on the query string', async () => {
    const res = await download(spec, '?format=xlsx')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/filename="hadafi-report-\d{4}-\d{2}-\d{2}\.xlsx"/)
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString('latin1')).toBe('PK')
  })

  test('a figure whose SQL the guard rejects fails the report with 400', async () => {
    const bad = structuredClone(spec)
    bad.sections[0]!.figures[0]!.sql = 'SELECT email FROM users'
    const res = await download({ ...bad, format: 'pdf' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as ErrorBody).error.code).toBe('SQL_REJECTED')
  })

  test('an unknown format is a validation error', async () => {
    expect((await download({ ...spec, format: 'docx' })).status).toBe(422)
    expect((await download(spec, '?format=docx')).status).toBe(422)
  })
})

describe('dashboards', () => {
  const chart = {
    sql: 'SELECT signup_month, count(*) AS learners FROM ai.learner GROUP BY 1 ORDER BY 1',
    chartType: 'line',
    encoding: { x: 'signup_month', y: 'learners' },
    title: 'Sign-ups per month',
  }

  type Board = { id: string; title: string; charts: unknown[]; createdBy: string | null }

  test('create, list, read, replace and delete a board', async () => {
    const created = await api<{ success: true; data: Board }>('POST', '/api/admin/ai/dashboards', {
      token: admin.token,
      body: { title: 'Growth', charts: [chart] },
    })
    expect(created.status).toBe(201)
    const id = created.body.data.id
    createdBoards.push(id)
    expect(created.body.data.charts).toEqual([chart])
    expect(created.body.data.createdBy).toBe(admin.id)

    const list = await api<{ success: true; data: Board[] }>('GET', '/api/admin/ai/dashboards', { token: admin.token })
    expect(list.status).toBe(200)
    expect(list.body.data.some((b) => b.id === id)).toBe(true)

    const one = await api<{ success: true; data: Board }>('GET', `/api/admin/ai/dashboards/${id}`, { token: admin.token })
    expect(one.body.data.title).toBe('Growth')

    const kpi = { sql: 'SELECT count(*) AS learners FROM ai.learner', chartType: 'kpi', encoding: { y: 'learners' } }
    const updated = await api<{ success: true; data: Board }>('PUT', `/api/admin/ai/dashboards/${id}`, {
      token: admin.token,
      body: { title: 'Growth (v2)', charts: [chart, kpi] },
    })
    expect(updated.status).toBe(200)
    expect(updated.body.data.title).toBe('Growth (v2)')
    expect(updated.body.data.charts.length).toBe(2)

    expect((await api('DELETE', `/api/admin/ai/dashboards/${id}`, { token: admin.token })).status).toBe(200)
    expect((await api('GET', `/api/admin/ai/dashboards/${id}`, { token: admin.token })).status).toBe(404)
  })

  test('an invalid chart spec is refused and names the chart', async () => {
    const res = await api<ErrorBody>('POST', '/api/admin/ai/dashboards', {
      token: admin.token,
      body: { title: 'Broken', charts: [chart, { sql: 'SELECT 1', chartType: 'radar', encoding: {} }] },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_CHART_SPEC')
    expect(res.body.error.message).toContain('charts[1]')
  })

  test('a missing title is a validation error; unknown and malformed ids are 404', async () => {
    expect((await api('POST', '/api/admin/ai/dashboards', { token: admin.token, body: { charts: [] } })).status).toBe(422)
    expect((await api('GET', `/api/admin/ai/dashboards/${crypto.randomUUID()}`, { token: admin.token })).status).toBe(404)
    expect((await api('GET', '/api/admin/ai/dashboards/not-a-uuid', { token: admin.token })).status).toBe(404)
    expect((await api('DELETE', '/api/admin/ai/dashboards/not-a-uuid', { token: admin.token })).status).toBe(404)
  })
})
