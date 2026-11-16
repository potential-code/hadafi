import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import crypto from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { users, adminAuditLog, organisations, aiReports, aiReportNotes } from '../db/schema'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { build } from 'esbuild'
import type { Request, Response } from 'express'
import { auditSink, auditActorKnown, auditAdminActions, flushAuditWrites, summariseRequest, REDACTED, CLIENT_CLOSED } from '../middleware/audit-log'
import type { InsertAdminAuditLogRow } from '../db/schema'
import { startTestServer, stopTestServer, createTestUser, cleanupFixtureUsers, fixtureEmail, rawHttp, pipelineAndHangUp, waitFor, ORIGIN, type TestUser } from './helpers'

/**
 * The admin audit log (middleware/audit-log.ts): every mutating /api request
 * by an admin session or an operator key, plus bulk exports via an operator
 * key, written after the response.
 */

let base: string
let admin: TestUser
let learner: TestUser
let serviceUserId: string
const serviceEmail = fixtureEmail('maya-audit')
const KEY = `hadafi_op_${crypto.randomBytes(32).toString('base64url')}`
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const orgIds: string[] = []
const reportIds: string[] = []

const savedEnv = { keys: process.env['OPERATOR_API_KEYS'], email: process.env['OPERATOR_SERVICE_USER_EMAIL'] }
const realWrite = auditSink.write

async function call(method: string, path: string, opts: { key?: string; cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
  let body: unknown = null
  try { body = await res.json() } catch { /* empty or binary body */ }
  return { status: res.status, body }
}

/** The audit rows for one actor and path, once in-flight writes have landed. */
async function rowsFor(actorUserId: string, path: string) {
  await Bun.sleep(30) // let the response's 'finish' event fire
  await flushAuditWrites()
  return db.select().from(adminAuditLog).where(and(eq(adminAuditLog.actorUserId, actorUserId), eq(adminAuditLog.path, path)))
}

beforeAll(async () => {
  base = await startTestServer()
  learner = await createTestUser('audit-learner')
  admin = await createTestUser('audit-admin', 'admin')
  const [row] = await db.insert(users).values({ fullName: 'Maya (AI operator)', email: serviceEmail, role: 'admin' }).returning({ id: users.id })
  serviceUserId = row!.id
  process.env['OPERATOR_API_KEYS'] = `maya-audit:${sha256(KEY)}`
  process.env['OPERATOR_SERVICE_USER_EMAIL'] = serviceEmail
})

afterEach(() => {
  auditSink.write = realWrite
})

afterAll(async () => {
  auditSink.write = realWrite
  for (const [name, value] of [['OPERATOR_API_KEYS', savedEnv.keys], ['OPERATOR_SERVICE_USER_EMAIL', savedEnv.email]] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  await flushAuditWrites()
  await db.delete(adminAuditLog).where(inArray(adminAuditLog.actorUserId, [admin.id, learner.id, serviceUserId]))
  if (orgIds.length) await db.delete(organisations).where(inArray(organisations.id, orgIds))
  if (reportIds.length) await db.delete(aiReports).where(inArray(aiReports.id, reportIds)) // notes cascade
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('admin audit log', () => {
  it('records an admin session mutation, with route params and status', async () => {
    const created = await call('POST', '/api/admin/organisations', { cookie: admin.token, body: { name: 'Audit Test Org', type: 'other' } })
    expect(created.status).toBe(201)
    const orgId = (created.body as { data: { id: string } }).data.id
    orgIds.push(orgId)
    const path = `/api/admin/organisations/${orgId}`
    expect((await call('PATCH', path, { cookie: admin.token, body: { name: 'Audit Test Org 2' } })).status).toBe(200)

    const [row] = await rowsFor(admin.id, path)
    expect(row).toBeDefined()
    expect(row!.actorKind).toBe('session')
    expect(row!.keyLabel).toBeNull()
    expect(row!.method).toBe('PATCH')
    expect(row!.statusCode).toBe(200)
    expect(row!.targetIds).toEqual({ id: orgId })
    expect(row!.requestSummary).toEqual({ body: { name: 'Audit Test Org 2' } })
    expect(row!.ip).toBeTruthy()
    // The create (no params) is recorded too.
    expect(await rowsFor(admin.id, '/api/admin/organisations')).toHaveLength(1)
  })

  it('keeps the route params when the request fails (error handler path)', async () => {
    const id = crypto.randomUUID()
    const path = `/api/admin/mentor-applications/${id}/reject`
    expect((await call('POST', path, { cookie: admin.token })).status).toBe(404)
    const [row] = await rowsFor(admin.id, path)
    expect(row!.statusCode).toBe(404)
    expect(row!.targetIds).toEqual({ id })
  })

  it('records an operator-key mutation as the service user, with the key label', async () => {
    const id = crypto.randomUUID()
    const path = `/api/admin/announcements/${id}/end`
    expect((await call('POST', path, { key: KEY })).status).toBe(404)
    const [row] = await rowsFor(serviceUserId, path)
    expect(row!.actorKind).toBe('operator_key')
    expect(row!.keyLabel).toBe('maya-audit')
    expect(row!.targetIds).toEqual({ id })
  })

  it('lets a key add a note to an AI safety report, recorded like any other mutation', async () => {
    const [report] = await db
      .insert(aiReports)
      .values({ userId: learner.id, surface: 'ask-hana', reason: 'wrong', reply: 'Audit test answer', replyHash: crypto.randomUUID() })
      .returning({ id: aiReports.id })
    const reportId = report!.id
    reportIds.push(reportId)
    const path = `/api/admin/ai-reports/${reportId}/notes`

    const res = await call('POST', path, { key: KEY, body: { text: 'Prompt fixed' } })
    expect(res.status).toBe(201)
    const notes = await db.select().from(aiReportNotes).where(eq(aiReportNotes.reportId, reportId))
    expect(notes.map((n) => [n.text, n.adminId])).toEqual([['Prompt fixed', serviceUserId]])

    const [row] = await rowsFor(serviceUserId, path)
    expect(row).toBeDefined()
    expect(row!.actorKind).toBe('operator_key')
    expect(row!.keyLabel).toBe('maya-audit')
    expect(row!.method).toBe('POST')
    expect(row!.statusCode).toBe(201)
    expect(row!.targetIds).toEqual({ id: reportId })
    expect(row!.requestSummary).toEqual({ body: { text: 'Prompt fixed' } })
  })

  it('does not record plain GETs, by session or by key', async () => {
    expect((await call('GET', '/api/admin/invites', { cookie: admin.token })).status).toBe(200)
    expect((await call('GET', '/api/admin/invites', { key: KEY })).status).toBe(200)
    expect(await rowsFor(admin.id, '/api/admin/invites')).toHaveLength(0)
    expect(await rowsFor(serviceUserId, '/api/admin/invites')).toHaveLength(0)
  })

  it('records exports downloaded with an operator key (not with a session)', async () => {
    // The bookings export is the one export the operator MCP uses.
    const eventId = crypto.randomUUID()
    const path = `/api/live-events/${eventId}/bookings/export`
    const viaKey = await fetch(`${base}${path}?format=csv`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${KEY}` } })
    await viaKey.arrayBuffer()
    const viaSession = await fetch(`${base}${path}?format=csv`, { headers: { Origin: ORIGIN, Cookie: admin.token } })
    await viaSession.arrayBuffer()
    expect(viaSession.status).toBe(viaKey.status)

    const [row] = await rowsFor(serviceUserId, path)
    expect(row!.method).toBe('GET')
    expect(row!.statusCode).toBe(viaKey.status)
    expect(row!.targetIds).toEqual({ id: eventId })
    expect(row!.requestSummary).toEqual({ query: { format: 'csv' } })
    expect(await rowsFor(admin.id, path)).toHaveLength(0)
  })

  it('records an operator key refused on a bulk export it may not use', async () => {
    const path = '/api/admin/exports/learners'
    const res = await fetch(`${base}${path}?format=csv`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${KEY}` } })
    expect(res.status).toBe(403)
    await res.arrayBuffer()
    const [row] = await rowsFor(serviceUserId, path)
    expect(row!.statusCode).toBe(403)
    expect(row!.actorKind).toBe('operator_key')
  })

  it('does not record non-admin users', async () => {
    expect((await call('POST', '/api/me/notifications/read-all', { cookie: learner.token })).status).toBe(200)
    expect(await rowsFor(learner.id, '/api/me/notifications/read-all')).toHaveLength(0)
  })

  it('redacts secrets in the stored request body but keeps emails', async () => {
    const id = crypto.randomUUID()
    const path = `/api/admin/announcements/${id}/end`
    await call('POST', path, { key: KEY, body: { email: 'someone@example.com', password: 'hunter2-hunter2', note: 'ok' } })
    const [row] = await rowsFor(serviceUserId, path)
    expect(row!.requestSummary).toEqual({ body: { email: 'someone@example.com', password: REDACTED, note: 'ok' } })
  })

  it('records a DELETE with its route params', async () => {
    const created = await call('POST', '/api/admin/organisations', { cookie: admin.token, body: { name: 'Audit Delete Org', type: 'other' } })
    const orgId = (created.body as { data: { id: string } }).data.id
    orgIds.push(orgId)
    // Hadafi has no partner-invite cancel route (SMEEP's .../invites/:inviteId); removing a learner is the two-param DELETE here.
    const userId = crypto.randomUUID()
    const path = `/api/admin/organisations/${orgId}/learners/${userId}`
    const res = await call('DELETE', path, { key: KEY })
    const [row] = await rowsFor(serviceUserId, path)
    expect(row!.method).toBe('DELETE')
    expect(row!.statusCode).toBe(res.status)
    expect(row!.targetIds).toEqual({ id: orgId, userId })
  })

  it('stores only the body keys for account routes (never a password or its confirmation)', async () => {
    const path = '/api/account/set-password'
    await call('POST', path, { cookie: admin.token, body: { password: 'brand-new-pass-1', confirm: 'brand-new-pass-1' } })
    const [row] = await rowsFor(admin.id, path)
    expect(row).toBeDefined()
    expect(row!.requestSummary).toEqual({ bodyKeys: ['password', 'confirm'] })
    expect(JSON.stringify(row)).not.toContain('brand-new-pass-1')
  })

  it('stores only the body keys for AI-mentor chat (no message content)', async () => {
    // An invalid session id: refused (422) before anything reaches the bot service.
    const path = '/api/ai-mentors/bot-1/chat'
    const text = 'A private question about my business finances'
    expect((await call('POST', path, { cookie: admin.token, body: { message: text, sessionId: 'not valid!' } })).status).toBe(422)
    const [row] = await rowsFor(admin.id, path)
    expect(row).toBeDefined()
    expect(row!.requestSummary).toEqual({ bodyKeys: ['message', 'sessionId'] })
    expect(JSON.stringify(row)).not.toContain(text)
  })

  it('stores the normalised path for an absolute-form request line', async () => {
    const id = crypto.randomUUID()
    const path = `/api/admin/announcements/${id}/end`
    const res = await rawHttp(`http://x${path}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN }, body: {} })
    expect(res.status).toBe(404)
    const [row] = await rowsFor(serviceUserId, path)
    expect(row).toBeDefined()
    expect(row!.path).toBe(path)
  })

  it('records a mutation whose caller hung up straight away (the change still happens)', async () => {
    const name = `Hang-up Org ${crypto.randomUUID().slice(0, 8)}`
    await rawHttp('/api/admin/organisations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN },
      body: { name, type: 'other' },
      hangUp: true,
    })
    const org = await waitFor(async () => (await db.select().from(organisations).where(eq(organisations.name, name)))[0])
    expect(org).toBeDefined()
    orgIds.push(org!.id)
    const rows = await waitFor(async () => {
      await flushAuditWrites()
      const found = await db.select().from(adminAuditLog).where(and(eq(adminAuditLog.actorUserId, serviceUserId), eq(adminAuditLog.path, '/api/admin/organisations')))
      return found.filter((r) => JSON.stringify(r.requestSummary).includes(name)).length ? found.filter((r) => JSON.stringify(r.requestSummary).includes(name)) : null
    })
    expect(rows).toHaveLength(1)
    expect([CLIENT_CLOSED, 201]).toContain(rows![0]!.statusCode)
    expect(rows![0]!.actorKind).toBe('operator_key')
  })

  it('records every pipelined mutation when the caller hangs up (not just the first)', async () => {
    // Three mutating requests in one socket write, then the socket is
    // destroyed before any response is read. Only the first response is ever
    // attached to the socket; the other two are queued behind it.
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const paths = ids.map((id) => `/api/admin/announcements/${id}/end`)
    await pipelineAndHangUp(paths.map((path) => ({ method: 'POST', path, headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN }, body: {} })))
    const rows = await waitFor(async () => {
      await flushAuditWrites()
      const found = await db.select().from(adminAuditLog).where(and(eq(adminAuditLog.actorUserId, serviceUserId), inArray(adminAuditLog.path, paths)))
      return found.length === paths.length ? found : null
    })
    expect(rows?.map((r) => r.path).sort()).toEqual([...paths].sort())
    for (const row of rows!) {
      expect([CLIENT_CLOSED, 404]).toContain(row.statusCode)
      expect(row.actorKind).toBe('operator_key')
    }
  })

  it('never breaks the request when the audit write fails', async () => {
    auditSink.write = () => Promise.reject(new Error('database is down'))
    const id = crypto.randomUUID()
    expect((await call('POST', `/api/admin/mentor-applications/${id}/reject`, { cookie: admin.token })).status).toBe(404)
    await flushAuditWrites()

    auditSink.write = () => { throw new Error('sync failure') }
    expect((await call('POST', `/api/admin/announcements/${id}/end`, { key: KEY })).status).toBe(404)
    await flushAuditWrites()
    // The server is still answering.
    expect((await call('GET', '/api/admin/invites', { cookie: admin.token })).status).toBe(200)
  })
})

describe('request summary redaction', () => {
  it('redacts password, token, secret and key fields at any depth', () => {
    const summary = summariseRequest(
      {},
      {
        email: 'a@b.co',
        password: 'p',
        newPassword: 'p',
        currentPassword: 'p',
        accessToken: 't',
        refresh_token: 't',
        clientSecret: 's',
        apiKey: 'k',
        api_key: 'k',
        key: 'k',
        otp: '123456',
        nested: { authorization: 'Bearer x', cookie: 'c', keep: 1, list: [{ token: 't', name: 'n' }] },
      },
    )
    expect(summary).toEqual({
      body: {
        email: 'a@b.co',
        password: REDACTED,
        newPassword: REDACTED,
        currentPassword: REDACTED,
        accessToken: REDACTED,
        refresh_token: REDACTED,
        clientSecret: REDACTED,
        apiKey: REDACTED,
        api_key: REDACTED,
        key: REDACTED,
        otp: REDACTED,
        nested: { authorization: REDACTED, cookie: REDACTED, keep: 1, list: [{ token: REDACTED, name: 'n' }] },
      },
    })
  })

  it('redacts secrets in the query string too', () => {
    expect(summariseRequest({ format: 'csv', token: 'abc' }, undefined)).toEqual({ query: { format: 'csv', token: REDACTED } })
  })

  it('keeps big bodies small: long strings, long arrays and deep nesting are cut', () => {
    const summary = summariseRequest({}, { text: 'x'.repeat(5000), items: Array.from({ length: 100 }, (_, i) => i), deep: { a: { b: { c: { d: { e: { f: 1 } } } } } } })
    const body = summary!['body'] as Record<string, unknown>
    expect((body['text'] as string).length).toBeLessThan(600)
    expect((body['items'] as unknown[]).length).toBeLessThanOrEqual(51)
    expect(JSON.stringify(body['deep'])).toContain('[truncated]')
    expect(JSON.stringify(summary).length).toBeLessThan(16_000)
  })

  it('is null when there is nothing to keep', () => {
    expect(summariseRequest({}, undefined)).toBeNull()
    expect(summariseRequest({}, {})).toBeNull()
  })
})

describe('callers that hang up (499)', () => {
  /** A request/response pair driven by hand: no socket, no timing. */
  function fakeExchange(opts: { method?: string; path?: string; body?: unknown; bearer?: boolean } = {}) {
    const path = opts.path ?? '/api/admin/organisations'
    const req = {
      method: opts.method ?? 'POST',
      originalUrl: path,
      url: path,
      headers: opts.bearer ? { authorization: 'Bearer k' } : {},
      query: {},
      body: opts.body ?? { name: 'Org' },
      params: {},
      ip: '127.0.0.1',
    } as unknown as Request
    const res = Object.assign(new EventEmitter(), {
      locals: {},
      statusCode: 200,
      writableFinished: false,
      getHeader: () => undefined,
    }) as unknown as Response & EventEmitter
    return { req, res }
  }

  function captureRows(): InsertAdminAuditLogRow[] {
    const rows: InsertAdminAuditLogRow[] = []
    auditSink.write = async (row) => { rows.push(row) }
    return rows
  }

  it('writes a 499 row once the actor is known when the socket closed first', async () => {
    const rows = captureRows()
    const { req, res } = fakeExchange()
    auditAdminActions(req, res, () => {})
    res.emit('close') // the caller hung up while authenticate() was still looking them up
    await flushAuditWrites()
    expect(rows).toHaveLength(0)

    req.user = { userId: crypto.randomUUID(), role: 'admin', via: 'session' }
    auditActorKnown(res)
    await flushAuditWrites()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.statusCode).toBe(CLIENT_CLOSED)
    expect(rows[0]!.method).toBe('POST')
    expect(rows[0]!.path).toBe('/api/admin/organisations')

    // Nothing is written twice, whatever fires afterwards.
    auditActorKnown(res)
    res.emit('finish')
    await flushAuditWrites()
    expect(rows).toHaveLength(1)
  })

  it('writes a 499 row straight away when the actor was already known', async () => {
    const rows = captureRows()
    const { req, res } = fakeExchange({ method: 'DELETE', path: '/api/admin/offers/abc' })
    auditAdminActions(req, res, () => {})
    req.user = { userId: crypto.randomUUID(), role: 'operator', via: 'operator_key', keyLabel: 'maya' }
    auditActorKnown(res)
    res.emit('close')
    await flushAuditWrites()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.statusCode).toBe(CLIENT_CLOSED)
    expect(rows[0]!.actorKind).toBe('operator_key')
  })

  it('writes nothing when the actor never becomes known (refused sign-in)', async () => {
    const rows = captureRows()
    const { req, res } = fakeExchange()
    auditAdminActions(req, res, () => {})
    res.emit('close')
    await flushAuditWrites()
    expect(rows).toHaveLength(0)
  })

  it('writes nothing for a non-admin session that hung up', async () => {
    const rows = captureRows()
    const { req, res } = fakeExchange()
    auditAdminActions(req, res, () => {})
    res.emit('close')
    req.user = { userId: crypto.randomUUID(), role: 'sme', via: 'session' }
    auditActorKnown(res)
    await flushAuditWrites()
    expect(rows).toHaveLength(0)
  })
})

describe('pipelined requests under Node (the production runtime)', () => {
  // Bun's node:http (which runs this suite) closes every pipelined response
  // when the socket goes; Node's does not: only the first response is ever
  // attached to the socket, so a check on the response alone misses the rest.
  // This runs tests/node/audit-pipelining.harness.ts with real Node.
  let child: ChildProcess
  let port = 0
  let stdout = ''
  let stderr = ''

  beforeAll(async () => {
    const outfile = path.resolve(import.meta.dir, '../../tmp/audit-pipelining-harness.mjs') // tmp/ is git-ignored
    await build({
      entryPoints: [path.resolve(import.meta.dir, 'node/audit-pipelining.harness.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile,
      logLevel: 'error',
    })
    // DATABASE_URL only has to be set: rows go to stdout, the pool never connects.
    child = spawn('node', [outfile], { env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgres://harness@127.0.0.1:1/none' } })
    child.stdout!.setEncoding('utf8').on('data', (d: string) => { stdout += d })
    child.stderr!.setEncoding('utf8').on('data', (d: string) => { stderr += d })
    port = await waitFor(async () => Number(/listening (\d+)/.exec(stdout)?.[1] ?? 0), 10_000)
    if (!port) throw new Error(`the Node harness did not start: ${stderr}`)
  })

  afterAll(() => {
    child?.kill()
  })

  const rowsFor = (prefix: string) =>
    stdout
      .split('\n')
      .filter((l) => l.startsWith('row '))
      .map((l) => JSON.parse(l.slice(4)) as { path: string; statusCode: number })
      .filter((r) => r.path.startsWith(prefix))

  const wire = (prefix: string, n: number, last = '') =>
    Array.from({ length: n }, (_, i) =>
      `POST ${prefix}${i} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 2\r\n${i === n - 1 ? last : ''}\r\n{}`,
    ).join('')

  it('writes a 499 row for each of three pipelined mutations when the caller hangs up', async () => {
    const prefix = `/api/things/hang-${crypto.randomUUID().slice(0, 8)}-`
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write(wire(prefix, 3), () => { socket.destroy(); resolve() }))
      socket.on('error', reject)
    })
    const rows = await waitFor(async () => (rowsFor(prefix).length >= 3 ? rowsFor(prefix) : null))
    expect(rows?.map((r) => r.path).sort()).toEqual([0, 1, 2].map((i) => `${prefix}${i}`))
    for (const row of rows!) expect(row.statusCode).toBe(CLIENT_CLOSED)
  })

  it('records many pipelined requests that complete, without piling listeners on the socket', async () => {
    const prefix = `/api/things/ok-${crypto.randomUUID().slice(0, 8)}-`
    const n = 15 // more than Node's default of 10 listeners per event
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write(wire(prefix, n, 'Connection: close\r\n')))
      socket.on('data', () => {})
      socket.on('close', () => resolve())
      socket.on('error', reject)
    })
    const rows = await waitFor(async () => (rowsFor(prefix).length >= n ? rowsFor(prefix) : null))
    expect(rows).toHaveLength(n)
    for (const row of rows!) expect(row.statusCode).toBe(204)
    expect(stderr).not.toContain('MaxListenersExceededWarning')
  })
})

describe('more secret field names', () => {
  it('redacts confirm, pwd, smtpPass, pin and code fields', () => {
    const summary = summariseRequest({}, {
      confirm: 'p',
      confirmPassword: 'p',
      pwd: 'p',
      newPwd: 'p',
      smtpPass: 'p',
      pass: 'p',
      pin: '1234',
      code: '123456',
      otpCode: '123456',
      verification_code: '123456',
      title: 'kept',
      pinned: true,
      codename: 'kept',
    })
    expect(summary).toEqual({
      body: {
        confirm: REDACTED,
        confirmPassword: REDACTED,
        pwd: REDACTED,
        newPwd: REDACTED,
        smtpPass: REDACTED,
        pass: REDACTED,
        pin: REDACTED,
        code: REDACTED,
        otpCode: REDACTED,
        verification_code: REDACTED,
        title: 'kept',
        pinned: true,
        codename: 'kept',
      },
    })
  })
})

describe('auth factors, signatures, keys and card details', () => {
  it('redacts totp, jwt, bearer, sig/signature, hmac, mfa, recovery and backup codes, private and signing keys, cvv, card numbers and iban', () => {
    const secret = {
      totp: 'x', totpSecret: 'x', TOTP_URI: 'x',
      jwt: 'x', idJwt: 'x', JWT: 'x',
      bearer: 'x', bearerValue: 'x',
      sig: 'x', SIG: 'x', webhook_sig: 'x', requestSig: 'x', signature: 'x', xSignature: 'x',
      hmac: 'x', HMAC_SHA256: 'x', bodyHmac: 'x',
      mfa: 'x', mfaSeed: 'x', MFA: 'x',
      recoveryCodes: ['x'], recovery_codes: ['x'], recoveryCode: 'x', backupCodes: ['x'], backup_code: 'x', BACKUPCODES: ['x'],
      privatekey: 'x', privateKey: 'x', PRIVATE_KEY: 'x', private_key_pem: 'x', signingkey: 'x', signingKey: 'x', SIGNING_KEY: 'x',
      cvv: '123', CVV2: '123', cardCvv: '123',
      cardNumber: '4111', card_number: '4111', CARDNUMBER: '4111',
      iban: 'AE07', IBAN: 'AE07', payoutIban: 'AE07',
    }
    const body = summariseRequest({}, secret)!['body'] as Record<string, unknown>
    for (const name of Object.keys(secret)) expect([name, body[name]]).toEqual([name, REDACTED])
  })

  it('keeps ordinary fields that only look similar', () => {
    const kept = {
      signup: 'a', design: 'a', signal: 'a', assignment: 'a', signedUpAt: 'a', signatory: 'a',
      recoveryEmail: 'a', backupDate: 'a', cardTitle: 'a', cardholderName: 'a', keyboard: 'a', publicKeyId: 'a',
      liberian: 'a', title: 'a',
    }
    expect(summariseRequest({}, kept)).toEqual({ body: kept })
  })
})

describe('keys-only paths', () => {
  const body = { password: 'secret-pass-1', confirm: 'secret-pass-1', note: 'hello' }

  it('stores body and query keys only under /api/account and /api/auth', () => {
    for (const path of ['/api/account/set-password', '/api/account/me', '/api/auth/sign-in/email', '/API/Account/me']) {
      const summary = summariseRequest({ token: 't', x: '1' }, body, path)
      expect([path, summary]).toEqual([path, { queryKeys: ['token', 'x'], bodyKeys: ['password', 'confirm', 'note'] }])
    }
  })

  it('stores body keys only for AI-mentor chat, Ask Hana, the AI examiner and AI tools', () => {
    for (const path of [
      '/api/ai-mentors/bot-1/chat',
      '/api/ask-hana/documents',
      '/api/ai/examiner/attempts',
      '/api/ai/anam/session-token',
      '/api/ai-tools/generate-pdf',
    ]) {
      expect([path, summariseRequest({}, { message: 'my private question', history: [] }, path)]).toEqual([path, { bodyKeys: ['message', 'history'] }])
    }
  })

  it('keeps values (redacted) on other routes', () => {
    expect(summariseRequest({}, body, '/api/admin/organisations')).toEqual({ body: { password: REDACTED, confirm: REDACTED, note: 'hello' } })
    // Not fooled by a lookalike prefix.
    expect(summariseRequest({}, { note: 'x' }, '/api/accounts-report')).toEqual({ body: { note: 'x' } })
    expect(summariseRequest({}, { note: 'x' }, '/api/ai-reports')).toEqual({ body: { note: 'x' } })
    expect(summariseRequest({}, { note: 'x' }, '/api/admin/ai/dashboards')).toEqual({ body: { note: 'x' } })
  })
})
