/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/fetch */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from 'bun:test'
// jsdom is a test-only dependency here without @types/jsdom; the root typecheck has noImplicitAny.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JSDOM } from 'jsdom'
import { createConsentStore, type CookieConsentState } from '@/lib/consent/store'
import { forgetBellPoll, pollBell } from '../NotificationBell'

/**
 * Hadafi's bell normally polls only the unread count; the list loads when the
 * panel opens. The learner GTM events (first_lesson_completed,
 * course_certificate) come from the server's one-time badge:first_step and
 * certificate:<id> notifications, so in the learner shell, while GTM runs on
 * a tracked page, the poll reads the list and hands it to noteNotifications
 * with the signed-in user's id. Otherwise (GTM off, an untracked page, a
 * document where GTM never started, a staff shell) it is the count alone,
 * exactly as before. The shell mounts two bells; they share one poll.
 */

const NOW = new Date('2026-11-16T10:00:00Z')
const item = (id: string, dedupeKey: string, type: string) => ({
  id,
  type,
  dedupeKey,
  title: 'New badge: First step',
  body: 'Complete your first learning step',
  link: '/dashboard/achievements',
  createdAt: NOW.toISOString(),
  readAt: null,
})

function fakeApi() {
  const calls: string[] = []
  return {
    calls,
    api: {
      fetchUnreadCount: async () => {
        calls.push('count')
        return 3
      },
      fetchNotifications: async () => {
        calls.push('list')
        return { items: [item('n1', 'badge:first_step', 'badge')], unread: 4 }
      },
    },
  }
}

function fakeStore(state: Partial<CookieConsentState>) {
  const seen: string[][] = []
  const users: (string | null)[] = []
  return {
    seen,
    users,
    store: {
      getState: (): CookieConsentState => ({ gtmId: null, choice: null, open: false, tracked: false, running: false, ...state }),
      noteNotifications: (items: { id: string }[], userId: string | null) => {
        seen.push(items.map((i) => i.id))
        users.push(userId)
      },
    },
  }
}

/** GTM loaded and the page tracked. */
const RUNNING = { gtmId: 'GTM-TEST1234', tracked: true, running: true } as const

describe('the bell poll', () => {
  beforeEach(() => forgetBellPoll())

  it('reads only the count while GTM is off', async () => {
    const store = createConsentStore({ now: () => NOW })
    store.configure(null)
    const { calls, api } = fakeApi()
    expect(await pollBell(true, store, api)).toBe(3)
    expect(calls).toEqual(['count'])
  })

  it('reads the list in the learner shell on a tracked page and passes it to noteNotifications', async () => {
    const { store, seen } = fakeStore(RUNNING)
    const { calls, api } = fakeApi()
    expect(await pollBell(true, store, api)).toBe(4)
    expect(calls).toEqual(['list'])
    expect(seen).toEqual([['n1']])
  })

  it('reads only the count on an untracked page, and in staff shells', async () => {
    for (const [events, tracked] of [[true, false], [false, true]] as const) {
      forgetBellPoll()
      const { store, seen } = fakeStore({ ...RUNNING, tracked })
      const { calls, api } = fakeApi()
      expect(await pollBell(events, store, api)).toBe(3)
      expect(calls).toEqual(['count'])
      expect(seen).toEqual([])
    }
  })

  it('reads only the count where GTM never started, although the page is tracked (tainted document)', async () => {
    const { store, seen } = fakeStore({ ...RUNNING, running: false })
    const { calls, api } = fakeApi()
    expect(await pollBell(true, store, api, 'u1')).toBe(3)
    expect(calls).toEqual(['count'])
    expect(seen).toEqual([])
  })

  it("hands the list over with the signed-in user's id; another user's poll is never shared", async () => {
    const { store, seen, users } = fakeStore(RUNNING)
    const { calls, api } = fakeApi()
    await pollBell(true, store, api, 'learner-a')
    await pollBell(true, store, api, 'learner-b') // within the share window, but another account
    expect(calls).toEqual(['list', 'list'])
    expect([seen, users]).toEqual([[['n1'], ['n1']], ['learner-a', 'learner-b']])
  })

  it('polls that start together share one request and its result', async () => {
    const { store, seen } = fakeStore(RUNNING)
    const { calls, api } = fakeApi()
    expect(await Promise.all([pollBell(true, store, api), pollBell(true, store, api)])).toEqual([4, 4])
    expect(await pollBell(true, store, api)).toBe(4) // just after: still the same poll
    expect(calls).toEqual(['list'])
    expect(seen).toEqual([['n1']])
    forgetBellPoll() // a notification was read: ask again
    await pollBell(true, store, api)
    expect(calls).toEqual(['list', 'list'])
  })

  it('a failed poll is not reused', async () => {
    const { store } = fakeStore({})
    let n = 0
    const api = { ...fakeApi().api, fetchUnreadCount: async () => (n++ === 0 ? Promise.reject(new Error('offline')) : 2) }
    await expect(pollBell(false, store, api)).rejects.toThrow('offline')
    expect(await pollBell(false, store, api)).toBe(2)
  })
})

// ── Mounted bells (jsdom, as in cookieBanner.test.tsx) ───────────────────────

const g = globalThis as any
const saved: Record<string, unknown> = {}
let React: typeof import('react')
let act: typeof import('react').act
let createRoot: typeof import('react-dom/client').createRoot
let NotificationBell: typeof import('../NotificationBell').NotificationBell
let AppRouterContext: any
const requests: string[] = []

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://hadafi.test/dashboard', pretendToBeVisual: true })
  for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']) saved[k] = g[k]
  g.window = dom.window
  g.document = dom.window.document
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  g.localStorage = dom.window.localStorage
  g.HTMLElement = dom.window.HTMLElement
  g.Node = dom.window.Node
  g.Event = dom.window.Event
  g.MouseEvent = dom.window.MouseEvent
  g.KeyboardEvent = dom.window.KeyboardEvent
  g.CustomEvent = dom.window.CustomEvent
  g.IS_REACT_ACT_ENVIRONMENT = true
  // The API: the two bell endpoints, answered at once.
  g.fetch = async (url: string) => {
    requests.push(url.endsWith('/unread-count') ? 'count' : 'list')
    const data = url.endsWith('/unread-count') ? { unread: 3 } : { items: [item('n1', 'badge:first_step', 'badge')], unread: 4 }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  React = await import('react')
  act = React.act
  ;({ createRoot } = await import('react-dom/client'))
  ;({ NotificationBell } = await import('../NotificationBell'))
  ;({ AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime'))
})

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'navigator') Object.defineProperty(g, 'navigator', { value: v, configurable: true, writable: true })
    else if (v === undefined) delete g[k]
    else g[k] = v
  }
})

afterEach(() => jest.useRealTimers())

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }

function newStore() {
  forgetBellPoll()
  requests.length = 0
  g.window.localStorage.clear()
  for (const s of [...g.document.head.querySelectorAll('script')]) s.remove()
  delete g.window.dataLayer
  delete g.window.gtag
  delete g.window.__hadafiGtmLoaded
  delete g.window.__hadafiLeaving
  const nav = { reload() {}, assign() {}, replace() {} }
  return createConsentStore({ storage: g.window.localStorage, win: g.window, now: () => NOW, navigate: nav })
}

/** Lets fetches resolve and React apply what they set. */
const settle = () => act(async () => {})

async function render(ui: React.ReactElement) {
  const host = g.document.createElement('div')
  g.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => root.render(<AppRouterContext.Provider value={router}>{ui}</AppRouterContext.Provider>))
  await settle()
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

const badges = (host: HTMLElement) => [...host.querySelectorAll('button[aria-haspopup="dialog"]')].map((b: any) => b.getAttribute('aria-label'))

describe('the bell, mounted', () => {
  it('two bells (sidebar + phone top bar) make one list fetch per poll interval and show the same count', async () => {
    jest.useFakeTimers()
    const store = newStore()
    store.configure('GTM-TEST1234')
    store.enterPath('/dashboard')
    expect(store.getState().tracked).toBe(true)
    const v = await render(
      <>
        <NotificationBell variant="sidebar" events store={store} />
        <NotificationBell events store={store} />
      </>,
    )
    expect(requests).toEqual(['list'])
    expect(badges(v.host)).toEqual(['Notifications, 4 unread', 'Notifications, 4 unread'])
    for (let i = 2; i <= 4; i++) {
      await act(async () => void jest.advanceTimersByTime(60_000))
      await settle()
      expect(requests).toEqual(Array(i).fill('list'))
    }
    // Back to the tab a little later: one more check, still shared.
    await act(async () => void jest.advanceTimersByTime(5_000))
    await act(async () => void g.document.dispatchEvent(new g.window.Event('visibilitychange')))
    await settle()
    expect(requests).toEqual(Array(5).fill('list'))
    await v.unmount()
  })

  it('starts fetching the list when tracking switches on', async () => {
    const store = newStore()
    const v = await render(<NotificationBell events store={store} />)
    expect(requests).toEqual(['count']) // GTM not configured yet
    expect(badges(v.host)).toEqual(['Notifications, 3 unread'])
    await act(async () => {
      store.configure('GTM-TEST1234') // /public-config answered
      store.enterPath('/dashboard')
    })
    await settle()
    expect(store.getState().tracked).toBe(true)
    expect(requests).toEqual(['count', 'list'])
    expect(badges(v.host)).toEqual(['Notifications, 4 unread'])
    await v.unmount()
  })

  it('a tainted document (invite-code sign-up, then /dashboard client-side) polls only the count', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    store.enterPath('/sign-up?code=INV123')
    store.enterPath('/dashboard')
    expect(store.getState()).toMatchObject({ tracked: true, running: false })
    const v = await render(<NotificationBell events userId="u1" store={store} />)
    expect(requests).toEqual(['count'])
    await v.unmount()
  })

  it('a different signed-in user re-polls at once and the list is noted for them', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    store.enterPath('/dashboard')
    const noted: [string[], string | null][] = []
    const spy = { ...store, noteNotifications: (items: { id: string }[], userId: string | null) => void noted.push([items.map((i) => i.id), userId]) }
    const host = g.document.createElement('div')
    g.document.body.appendChild(host)
    const root = createRoot(host)
    const ui = (userId: string) => (
      <AppRouterContext.Provider value={router}>
        <NotificationBell events userId={userId} store={spy} />
      </AppRouterContext.Provider>
    )
    await act(async () => root.render(ui('learner-a')))
    await settle()
    await act(async () => root.render(ui('learner-b')))
    await settle()
    expect(requests).toEqual(['list', 'list'])
    expect(noted).toEqual([[['n1'], 'learner-a'], [['n1'], 'learner-b']])
    await act(async () => root.unmount())
    host.remove()
  })

  it('a staff shell bell keeps polling only the count while tracking is on', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    store.enterPath('/dashboard')
    const v = await render(<NotificationBell store={store} />)
    expect(requests).toEqual(['count'])
    await v.unmount()
  })

  it('every list fetch (poll and opening the panel) goes to noteNotifications in the learner shell only', async () => {
    for (const events of [true, false]) {
      const store = newStore()
      store.configure('GTM-TEST1234')
      store.enterPath('/dashboard')
      const noted: string[][] = []
      const spy = { ...store, noteNotifications: (items: { id: string }[]) => void noted.push(items.map((i) => i.id)) }
      const v = await render(<NotificationBell events={events} store={spy} />)
      const button = v.host.querySelector('button') as HTMLButtonElement
      await act(async () => void button.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })))
      await settle()
      expect(g.document.body.textContent).toContain('New badge: First step')
      expect(requests).toEqual(events ? ['list', 'list'] : ['count', 'list'])
      expect(noted).toEqual(events ? [['n1'], ['n1']] : [])
      await v.unmount()
    }
  })
})
