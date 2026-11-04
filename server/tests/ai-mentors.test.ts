import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { withDocument } from '../controllers/aiMentor.controller'

/**
 * AI mentor chat goes through the Hadafi server, not from the browser to the
 * bot service: only Hadafi's mentors, only for signed-in learners, never the
 * bot's system prompt, and session ids scoped to the learner. A local fake
 * stands in for the bot service (AI_MENTOR_API_URL).
 */

const BOT = '64b7b59c2d7b52ec97f3a258' // Enterprise Sales Coach
let learner: TestUser
let fake: Server
let lastChat: { url: string; body: { message: string; sessionId: string } } | null = null
let previousUpstream: string | undefined

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      if (req.method === 'GET' && req.url === `/api/admin/bot/${BOT}`) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ _id: BOT, name: 'Sales Coach', greeting: 'Hello!', system: 'SECRET PROMPT', active: true, prePrompt: ['Tip one', 7, 'Tip two'] }))
        return
      }
      if (req.method === 'POST' && req.url === `/agent/chatbot/${BOT}/chat`) {
        lastChat = { url: req.url, body: JSON.parse(raw) }
        res.setHeader('Content-Type', 'text/event-stream')
        res.write('data: {"content":"Hi "}\n\n')
        res.end('data: {"content":"there"}\n\n')
        return
      }
      res.statusCode = 500
      res.end()
    })
  })
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', () => resolve()))
  const addr = fake.address()
  if (!addr || typeof addr === 'string') throw new Error('fake bot service did not bind')
  previousUpstream = process.env['AI_MENTOR_API_URL']
  process.env['AI_MENTOR_API_URL'] = `http://127.0.0.1:${addr.port}`

  await startTestServer()
  learner = await createTestUser('ai-mentor')
})

afterAll(async () => {
  if (previousUpstream === undefined) delete process.env['AI_MENTOR_API_URL']
  else process.env['AI_MENTOR_API_URL'] = previousUpstream
  await new Promise<void>((resolve) => fake.close(() => resolve()))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('withDocument', () => {
  it('leaves a plain message alone', () => {
    expect(withDocument('Hello')).toBe('Hello')
  })

  it('attaches the document after the message, cut to length', () => {
    expect(withDocument('Review this', { name: 'plan.txt', text: 'Our plan' })).toBe('Review this\n\n[Attached document "plan.txt"]\nOur plan')
    const long = withDocument('Hi', { name: 'long.txt', text: 'x'.repeat(15_000) })
    expect(long).toContain('(only the first part of a long document)')
    expect(long.length).toBeLessThan(12_200)
  })

  it('cannot break out of the document label', () => {
    expect(withDocument('Hi', { name: 'a"b\nc.txt', text: 't' })).toContain(`[Attached document "a'b'c.txt"]`)
  })
})

describe('GET /api/ai-mentors/:botId', () => {
  it('returns the greeting and ice-breakers, never the system prompt', async () => {
    const res = await api<{ data: Record<string, unknown> }>('GET', `/api/ai-mentors/${BOT}`, { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ name: 'Sales Coach', greeting: 'Hello!', active: true, prePrompt: ['Tip one', 'Tip two'] })
    expect(JSON.stringify(res.body)).not.toContain('SECRET')
  })

  it('refuses unknown mentors and signed-out callers', async () => {
    expect((await api('GET', '/api/ai-mentors/not-a-bot', { token: learner.token })).status).toBe(404)
    expect((await api('GET', `/api/ai-mentors/${BOT}`)).status).toBe(401)
  })
})

describe('POST /api/ai-mentors/:botId/chat', () => {
  const chat = (body: object, bot = BOT) => api('POST', `/api/ai-mentors/${bot}/chat`, { token: learner.token, body })

  it('streams the reply and scopes the session to the learner', async () => {
    const baseUrl = await startTestServer()
    const res = await fetch(`${baseUrl}/api/ai-mentors/${BOT}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${learner.token}` },
      body: JSON.stringify({ message: 'Help me sell', sessionId: 's-1' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('"content":"Hi "')
    expect(text).toContain('"content":"there"')
    expect(lastChat?.body.message).toBe('Help me sell')
    expect(lastChat?.body.sessionId).toBe(`hadafi-${learner.id}-s-1`)
  })

  it('rejects bad payloads before reaching the bot', async () => {
    expect((await chat({ message: '', sessionId: 's1' })).status).toBe(422)
    expect((await chat({ message: 'Hi', sessionId: 'bad id!' })).status).toBe(422)
    expect((await chat({ message: 'Hi', sessionId: 's1', document: { name: 'big.txt', text: 'x'.repeat(20_001) } })).status).toBe(422)
  })

  it('refuses unknown mentors and signed-out callers', async () => {
    expect((await chat({ message: 'Hi', sessionId: 's1' }, 'not-a-bot')).status).toBe(404)
    expect((await api('POST', `/api/ai-mentors/${BOT}/chat`, { body: { message: 'Hi', sessionId: 's1' } })).status).toBe(401)
  })
})
