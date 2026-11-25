import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { apiFetch } from '../api'

/** apiFetch throws the parsed error body with the HTTP status added, so callers can tell 429 and 409 apart. */
const realFetch = globalThis.fetch
let reply: () => Response

beforeAll(() => {
  globalThis.fetch = (async () => reply()) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

async function thrown(): Promise<Record<string, unknown>> {
  try {
    await apiFetch('/api/x')
  } catch (err) {
    return err as Record<string, unknown>
  }
  throw new Error('apiFetch did not throw')
}

describe('apiFetch errors', () => {
  it('keep the JSON body and add the status', async () => {
    reply = () => new Response(JSON.stringify({ success: false, error: { code: 'SLOT_TAKEN', message: 'Taken' } }), { status: 409 })
    expect(await thrown()).toEqual({ success: false, error: { code: 'SLOT_TAKEN', message: 'Taken' }, status: 409 })
  })

  it('carry the status when the body has only a message (Better Auth 429)', async () => {
    reply = () => new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })
    expect(await thrown()).toEqual({ message: 'Too many requests', status: 429 })
  })

  it('carry the status when the body is not JSON', async () => {
    reply = () => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })
    expect(await thrown()).toEqual({ error: 'Bad Gateway', status: 502 })
  })

  it('still return the JSON on success', async () => {
    reply = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    expect(await apiFetch('/api/x')).toEqual({ ok: true })
  })
})
