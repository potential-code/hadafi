import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'

/**
 * The Hana (copilot) token is cached in localStorage for up to an hour. On a
 * shared browser, a second person who signs in without the first signing out
 * must never have their chats run under the first person's token (their
 * account, their conversation history, their role). A cached user token is
 * only used for the account it names; switching accounts drops it.
 */

// A minimal browser: localStorage, sessionStorage and events.
class MemoryStorage {
  private items = new Map<string, string>()
  getItem(k: string) { return this.items.has(k) ? this.items.get(k)! : null }
  setItem(k: string, v: string) { this.items.set(k, String(v)) }
  removeItem(k: string) { this.items.delete(k) }
  clear() { this.items.clear() }
  key(i: number) { return [...this.items.keys()][i] ?? null }
  get length() { return this.items.size }
}
const local = new MemoryStorage()
const minted: string[] = []
let mintFor = 'user-b'
// Who the server says is signed in (the session cookie), whatever the page cached.
let sessionUser: string | null = 'user-b'

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tokenFor = (userId: string | null, scope = 'user') =>
  `${b64url({ alg: 'HS256' })}.${b64url({ platformId: 'hadafi', ...(userId ? { userId } : {}), scope })}.sig`

let cfg: typeof import('../copilotConfig')
let auth: typeof import('@/lib/auth')

beforeAll(async () => {
  // Object.keys(localStorage) must list the stored keys, as in a browser.
  const storage = new Proxy(local, {
    ownKeys: (t) => [...(t as unknown as { items: Map<string, string> }).items.keys()],
    getOwnPropertyDescriptor: (t, k) =>
      typeof k === 'string' && (t as unknown as { items: Map<string, string> }).items.has(k)
        ? { enumerable: true, configurable: true, value: t.getItem(k) }
        : undefined,
  })
  const g = globalThis as unknown as Record<string, unknown>
  g.window = { localStorage: storage, sessionStorage: new MemoryStorage(), dispatchEvent: () => true, location: { origin: 'http://localhost:3000' } }
  g.localStorage = storage
  // The Hadafi server: the session endpoint, and the token endpoint answering
  // for whoever is "signed in" now.
  g.fetch = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/get-session')) {
      const body = sessionUser
        ? { session: { id: 's1', userId: sessionUser }, user: { id: sessionUser, name: sessionUser, email: `${sessionUser}@example.test`, role: 'sme' } }
        : null
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    minted.push(String(url))
    return new Response(
      JSON.stringify({ success: true, data: { token: tokenFor(String(url).includes('/guest') ? null : mintFor, 'user'), expiresAt: Date.now() + 3600_000 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  cfg = await import('../copilotConfig')
  auth = await import('@/lib/auth')
})

const user = (id: string) => ({ id, fullName: id, email: `${id}@example.test`, role: 'sme' }) as Parameters<typeof auth.cacheUser>[0]
const cacheToken = (token: string, kind: 'user' | 'guest') => {
  local.setItem('hadafi_copilot_jwt', token)
  local.setItem('hadafi_copilot_jwt_exp', String(Date.now() + 3600_000))
  local.setItem('hadafi_copilot_jwt_kind', kind)
}

beforeEach(() => {
  local.clear()
  minted.length = 0
})

describe('the cached Hana token', () => {
  // Must run before any other ensureCopilotToken call: the session is confirmed once per page load.
  it('on a fresh page, checks who is really signed in before using a cached token', async () => {
    // The page still remembers person A, but the session cookie is now person B's.
    auth.cacheUser(user('user-a'))
    cacheToken(tokenFor('user-a'), 'user')
    sessionUser = 'user-b'
    mintFor = 'user-b'
    const token = await cfg.ensureCopilotToken()
    expect(cfg.tokenUserId(token!)).toBe('user-b')
    expect(auth.getUser()?.id).toBe('user-b')
    expect(cfg.getCopilotJwt()).toBe(token!)
  })

  it("serves the account it was minted for", () => {
    auth.cacheUser(user('user-a'))
    cacheToken(tokenFor('user-a'), 'user')
    expect(cfg.getCopilotJwt()).toBe(tokenFor('user-a'))
  })

  it('is dropped when a different account signs in on the same browser', () => {
    auth.cacheUser(user('user-a'))
    cacheToken(tokenFor('user-a'), 'user')
    auth.cacheUser(user('user-b'))
    expect(local.getItem('hadafi_copilot_jwt')).toBeNull()
    expect(cfg.getCopilotJwt()).toBe('')
  })

  it("is never handed to someone else, even if it is still in storage", () => {
    // e.g. another tab wrote it after this tab switched accounts.
    auth.cacheUser(user('user-b'))
    cacheToken(tokenFor('user-a'), 'user')
    expect(cfg.getCopilotJwt()).toBe('')
    expect(cfg.getCopilotHeaders()).toEqual({})
  })

  it("mints the new person's own token instead of reusing the old one", async () => {
    auth.cacheUser(user('user-b'))
    cacheToken(tokenFor('user-a'), 'user')
    mintFor = 'user-b'
    const token = await cfg.ensureCopilotToken()
    expect(minted.some((u) => u.endsWith('/api/account/copilot-token'))).toBe(true)
    expect(cfg.tokenUserId(token!)).toBe('user-b')
    expect(cfg.getCopilotJwt()).toBe(token!)
  })

  it('treats an unreadable user token as not theirs', () => {
    auth.cacheUser(user('user-a'))
    cacheToken('not-a-jwt', 'user')
    expect(cfg.getCopilotJwt()).toBe('')
  })

  it('lets a guest token serve anyone (it names nobody)', () => {
    auth.cacheUser(null)
    cacheToken(tokenFor(null, 'guest'), 'guest')
    expect(cfg.getCopilotJwt()).toBe(tokenFor(null, 'guest'))
  })
})
