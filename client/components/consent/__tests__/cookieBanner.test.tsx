/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/dataLayer */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
// jsdom is a test-only dependency here without @types/jsdom; the root typecheck has noImplicitAny.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JSDOM } from 'jsdom'

/**
 * The cookie banner in a real DOM (jsdom, already installed for
 * isomorphic-dompurify): it shows only when GTM is configured and no choice
 * is stored, both buttons work, and the footer's Cookie settings reopens it.
 */

const g = globalThis as any
const saved: Record<string, unknown> = {}
let React: typeof import('react')
let act: typeof import('react').act
let createRoot: typeof import('react-dom/client').createRoot
let CookieBannerView: typeof import('../CookieConsent').CookieBannerView
let CookieSettingsLink: typeof import('../CookieSettingsLink').CookieSettingsLink
let createConsentStore: typeof import('@/lib/consent/store').createConsentStore
let CONSENT_KEY: string

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://hadafi.test/' })
  for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT']) saved[k] = g[k]
  g.window = dom.window
  g.document = dom.window.document
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  g.localStorage = dom.window.localStorage
  g.HTMLElement = dom.window.HTMLElement
  g.Node = dom.window.Node
  g.Event = dom.window.Event
  g.MouseEvent = dom.window.MouseEvent
  g.KeyboardEvent = dom.window.KeyboardEvent
  g.IS_REACT_ACT_ENVIRONMENT = true
  React = await import('react')
  act = React.act
  ;({ createRoot } = await import('react-dom/client'))
  ;({ CookieBannerView } = await import('../CookieConsent'))
  ;({ CookieSettingsLink } = await import('../CookieSettingsLink'))
  ;({ createConsentStore } = await import('@/lib/consent/store'))
  ;({ CONSENT_KEY } = await import('@/lib/consent/consentStorage'))
})

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'navigator') Object.defineProperty(g, 'navigator', { value: v, configurable: true, writable: true })
    else if (v === undefined) delete g[k]
    else g[k] = v
  }
})

const nav = { reloads: 0, assigned: [] as string[] }
const navigate = { reload: () => void nav.reloads++, assign: (u: string) => void nav.assigned.push(u), replace: (u: string) => void nav.assigned.push(u) }

function newStore() {
  nav.reloads = 0
  nav.assigned = []
  g.window.localStorage.clear()
  for (const s of [...g.document.head.querySelectorAll('script')]) s.remove()
  delete g.window.dataLayer
  delete g.window.gtag
  delete g.window.__hadafiGtmLoaded
  delete g.window.__hadafiLeaving
  return createConsentStore({ storage: g.window.localStorage, win: g.window, now: () => new Date('2026-11-16T10:00:00Z'), navigate })
}

async function render(ui: React.ReactElement) {
  const host = g.document.createElement('div')
  g.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => root.render(ui))
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

const banner = () => g.document.querySelector('[aria-label="Cookie consent"]') as HTMLElement | null
const button = (name: string) =>
  [...g.document.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent?.trim() === name) as HTMLButtonElement | undefined

async function click(el: HTMLElement) {
  await act(async () => el.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })))
}

describe('cookie banner', () => {
  it('is not shown, and loads nothing, when GTM is not configured', async () => {
    const store = newStore()
    store.configure(null)
    const v = await render(
      <>
        <CookieBannerView store={store} pathname="/" />
        <CookieSettingsLink store={store} />
      </>,
    )
    expect(banner()).toBeNull()
    expect(button('Cookie settings')).toBeUndefined()
    expect(g.document.head.querySelector('script[src*="googletagmanager"]')).toBeNull()
    await v.unmount()
  })

  it('shows on a first visit with equal Accept and Reject buttons and a privacy link', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(<CookieBannerView store={store} pathname="/" />)
    const b = banner()!
    expect(b).not.toBeNull()
    expect(b.getAttribute('role')).toBe('region')
    expect(b.textContent).toContain('We use cookies to measure our campaigns and improve the site. You can change this at any time in Cookie settings.')
    const privacy = b.querySelector('a') as HTMLAnchorElement
    expect(privacy.textContent).toContain('Privacy Policy')
    expect(privacy.href).toBe('https://potential.com/privacy')
    const accept = button('Accept')!
    const reject = button('Reject')!
    expect(accept.className).toBe(reject.className) // equally prominent
    expect(accept.type).toBe('button')
    // Not a modal: no overlay, nothing made inert.
    expect(b.getAttribute('aria-modal')).toBeNull()
    expect(g.document.head.querySelector('script[src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234"]')).not.toBeNull()
    await v.unmount()
  })

  it('Accept stores the choice, grants consent and hides the banner', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(<CookieBannerView store={store} pathname="/" />)
    await click(button('Accept')!)
    expect(banner()).toBeNull()
    expect(JSON.parse(g.window.localStorage.getItem(CONSENT_KEY)).choice).toBe('accepted')
    expect(Array.from(g.window.dataLayer.at(-1))).toEqual([
      'consent',
      'update',
      { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' },
    ])
    await v.unmount()
  })

  it('Reject stores the choice, keeps consent denied and hides the banner', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(<CookieBannerView store={store} pathname="/" />)
    await click(button('Reject')!)
    expect(banner()).toBeNull()
    expect(JSON.parse(g.window.localStorage.getItem(CONSENT_KEY)).choice).toBe('rejected')
    const updates = g.window.dataLayer.map((e: any) => (e && 'length' in e ? Array.from(e) : e)).filter((e: any) => Array.isArray(e) && e[1] === 'update')
    expect(updates.every((u: any) => Object.values(u[2]).every((x) => x === 'denied'))).toBe(true)
    await v.unmount()
  })

  it("stays hidden for a returning visitor; the footer's Cookie settings reopens it and focuses it", async () => {
    const store = newStore()
    g.window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: 'rejected', version: 1, date: '2026-10-01T00:00:00Z' }))
    store.configure('GTM-TEST1234')
    const v = await render(
      <>
        <CookieBannerView store={store} pathname="/dashboard" />
        <CookieSettingsLink store={store} />
      </>,
    )
    expect(banner()).toBeNull()
    const link = button('Cookie settings')!
    link.focus()
    await click(link)
    expect(banner()).not.toBeNull()
    expect(banner()!.contains(g.document.activeElement)).toBe(true)
    await click(button('Accept')!)
    expect(banner()).toBeNull()
    // Focus goes back to the link that opened it.
    expect(g.document.activeElement).toBe(link)
    // Same after Reject.
    await click(link)
    await click(button('Reject')!)
    expect(g.document.activeElement).toBe(link)
    await v.unmount()
  })

  it('hides when the visitor moves to an untracked page, and the page reloads to drop GTM', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(
      <>
        <CookieBannerView store={store} pathname="/" />
        <CookieSettingsLink store={store} />
      </>,
    )
    expect(banner()).not.toBeNull()
    await v.unmount()
    const w = await render(
      <>
        <CookieBannerView store={store} pathname="/mentor/setup" />
        <CookieSettingsLink store={store} />
      </>,
    )
    expect(banner()).toBeNull()
    expect(button('Cookie settings')).toBeUndefined()
    expect(nav.reloads).toBe(1)
    await w.unmount()
  })

  it('sits above the learner tab bar on phones and below dialogs', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(<CookieBannerView store={store} pathname="/" />)
    const cls = banner()!.className.split(/\s+/)
    // Tab bar and header are z-30; Sheet is z-50 and the search dialog z-[60].
    expect(cls).toContain('z-40')
    expect(cls.some((c) => /^z-(50|\[6\d\])$/.test(c))).toBe(false)
    // Lifted above the learner tab bar ([data-app-tabbar]) below the lg breakpoint.
    expect(cls.some((c) => c.startsWith('max-lg:[body:has([data-app-tabbar])_&]:bottom-'))).toBe(true)
    await v.unmount()
    const { readFileSync } = await import('node:fs')
    const shell = readFileSync(new URL('../../shell/AppShell.tsx', import.meta.url), 'utf8')
    expect(shell).toMatch(/data-app-tabbar[\s\S]{0,200}sticky bottom-0 z-30/)
  })

  it('is not shown in the admin area', async () => {
    const store = newStore()
    store.configure('GTM-TEST1234')
    const v = await render(<CookieBannerView store={store} pathname="/admin/dashboard" />)
    expect(banner()).toBeNull()
    expect(g.document.head.querySelector('script[src*="googletagmanager"]')).toBeNull()
    await v.unmount()
  })
})
