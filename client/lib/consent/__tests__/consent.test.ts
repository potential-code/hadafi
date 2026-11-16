/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/dataLayer */
import { describe, expect, it } from 'bun:test'
import { validGtmId } from '../gtmId'
import { CONSENT_KEY, CONSENT_VERSION, readChoice, saveChoice } from '../consentStorage'
import { bootGtm, setConsent, isTrackedUrl, DENIED, GRANTED } from '../gtm'
import { createConsentStore } from '../store'

/** A Map-backed stand-in for localStorage. */
function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  }
}

/** Just enough window/document for the GTM loader: records appended scripts. */
function fakeWindow(start = '/', opts: { entries?: { url: string; sameDocument?: boolean }[] } = {}) {
  const appended: { src: string; async: boolean; dataLayerLength: number }[] = []
  const cookies: string[] = []
  const pushed: string[] = []
  const listeners: { type: string; fn: (e: any) => void; capture: boolean }[] = []
  const location: any = { hostname: 'hadafi.potential.org', origin: 'https://hadafi.potential.org' }
  const go = (url: string) => {
    const u = new URL(url, 'https://hadafi.potential.org')
    Object.assign(location, { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash })
  }
  go(start)
  const nav = { assigned: [] as string[], replaced: [] as string[], reloads: 0 }
  const navigate = {
    assign: (u: string) => void nav.assigned.push(u),
    replace: (u: string) => void nav.replaced.push(u),
    reload: () => void nav.reloads++,
  }
  const win: any = {
    location,
    history: {
      pushState: (_s: unknown, _t: string, url?: string | URL | null) => {
        pushed.push(String(url))
        if (url) go(String(url))
      },
      replaceState: (_s: unknown, _t: string, url?: string | URL | null) => {
        pushed.push('replace:' + String(url))
        if (url) go(String(url))
      },
    },
    addEventListener: (type: string, fn: (e: any) => void, capture?: boolean) => listeners.push({ type, fn, capture: !!capture }),
    /** Simulates the browser going back/forward to `url`, then firing popstate. */
    ...(opts.entries ? { navigation: { entries: () => opts.entries } } : {}),
    /** Simulates a fragment change to `url`, then firing hashchange. */
    hashTo(url: string) {
      go(url)
      let stopped = false
      const e = { stopImmediatePropagation: () => void (stopped = true) }
      for (const l of listeners.filter((x) => x.type === 'hashchange')) {
        if (stopped) break
        l.fn(e)
      }
      return { stopped }
    },
    popTo(url: string) {
      go(url)
      let stopped = false
      const e = { stopImmediatePropagation: () => void (stopped = true) }
      const later: string[] = []
      for (const l of listeners.filter((x) => x.type === 'popstate')) {
        if (stopped) break
        l.fn(e)
      }
      return { stopped, later }
    },
    document: {
      createElement: () => ({ src: '', async: false }),
      head: {
        appendChild: (el: { src: string; async: boolean }) => {
          appended.push({ src: el.src, async: el.async, dataLayerLength: win.dataLayer.length })
        },
      },
      get cookie() {
        return 'session=1; _ga=GA1.1.1; _ga_ABC=GS1; _gcl_au=1.1; other=2'
      },
      set cookie(v: string) {
        cookies.push(v)
      },
    },
  }
  return { win, appended, cookies, pushed, nav, navigate, listeners }
}

/** gtag pushes `arguments` objects; turn them into plain arrays to compare. */
const entries = (dl: unknown[]) => dl.map((e) => (e && typeof e === 'object' && 'length' in (e as object) ? Array.from(e as ArrayLike<unknown>) : e))

describe('GTM container id', () => {
  it('accepts GTM-XXXX ids only', () => {
    expect(validGtmId('GTM-54W3N48W')).toBe('GTM-54W3N48W')
    expect(validGtmId('  GTM-TEST1234 ')).toBe('GTM-TEST1234')
    expect(validGtmId('GTM-ABCD')).toBe('GTM-ABCD')
    expect(validGtmId('GTM-ABCDEFGHIJ')).toBe('GTM-ABCDEFGHIJ')
  })

  it("refuses the retired per-site containers (SMEEP, Hadafi, AI Amplify): only Potential.org's Main may load", () => {
    for (const old of ['GTM-NGQNTZJ', 'GTM-5C9G6FPK', 'GTM-PCDGSJLR', ' GTM-NGQNTZJ ']) expect(validGtmId(old)).toBeNull()
    expect(validGtmId('GTM-54W3N48W')).toBe('GTM-54W3N48W')
  })

  it('treats empty, unset or malformed ids as unset', () => {
    for (const bad of [undefined, null, '', '   ', 'GTM-', 'GTM-abc1234', 'GTM-ABC', 'GTM-ABCDEFGHIJK', 'G-ZBLPYC3MYL', 'AW-18570988662', 'GTM-ABCD"><script>', 'gtm-54w3n48w', 42]) {
      expect(validGtmId(bad)).toBeNull()
    }
  })
})

describe('stored cookie choice', () => {
  const now = new Date('2026-11-16T10:00:00Z')

  it('has no choice on a first visit', () => {
    expect(readChoice(memoryStorage(), now)).toBeNull()
  })

  it('remembers accept and reject with the version and date', () => {
    const s = memoryStorage()
    saveChoice(s, 'accepted', now)
    expect(JSON.parse(s.dump()[CONSENT_KEY])).toEqual({ choice: 'accepted', version: CONSENT_VERSION, date: now.toISOString() })
    expect(readChoice(s, now)).toBe('accepted')
    saveChoice(s, 'rejected', now)
    expect(readChoice(s, now)).toBe('rejected')
  })

  it('asks again after 12 months', () => {
    const s = memoryStorage()
    saveChoice(s, 'accepted', new Date('2025-11-16T10:00:00Z'))
    expect(readChoice(s, new Date('2026-11-16T09:59:59Z'))).toBe('accepted')
    expect(readChoice(s, new Date('2026-11-16T10:00:00Z'))).toBeNull()
  })

  it('asks again when the consent version changes', () => {
    const s = memoryStorage({ [CONSENT_KEY]: JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION - 1, date: now.toISOString() }) })
    expect(readChoice(s, now)).toBeNull()
  })

  it('ignores junk, future dates and unknown choices', () => {
    for (const raw of ['nope', '{}', JSON.stringify({ choice: 'maybe', version: CONSENT_VERSION, date: now.toISOString() }), JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION, date: 'x' }), JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION, date: '2027-06-01T00:00:00Z' })]) {
      expect(readChoice(memoryStorage({ [CONSENT_KEY]: raw }), now)).toBeNull()
    }
  })

  it('survives storage that throws (private mode)', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} }
    expect(readChoice(broken, now)).toBeNull()
    expect(() => saveChoice(broken, 'accepted', now)).not.toThrow()
  })
})

describe('GTM loader', () => {
  it('sets consent to denied before the GTM script is added', () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    expect(entries(win.dataLayer)[0]).toEqual([
      'consent',
      'default',
      { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 },
    ])
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234')
    expect(appended[0].async).toBe(true)
    // Everything up to and including gtm.start was queued before the script.
    const startAt = win.dataLayer.findIndex((e: any) => e?.event === 'gtm.js')
    expect(startAt).toBeGreaterThan(0)
    expect(appended[0].dataLayerLength).toBe(startAt + 1)
    // No consent update for a visitor who hasn't chosen.
    expect(entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')).toHaveLength(0)
  })

  it("re-applies a returning visitor's Accept before GTM loads", () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', 'accepted')
    const list = entries(win.dataLayer)
    const updateAt = list.findIndex((e: any) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update')
    expect(list[updateAt]).toEqual(['consent', 'update', GRANTED])
    expect(updateAt).toBeLessThan(appended[0].dataLayerLength)
  })

  it('keeps a returning Reject denied', () => {
    const { win } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', 'rejected')
    const updates = entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')
    expect(updates.every((u: any) => JSON.stringify(u[2]) === JSON.stringify(DENIED))).toBe(true)
  })

  it('loads the container once', () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    bootGtm(win, 'GTM-TEST1234', null)
    expect(appended).toHaveLength(1)
  })

  it('updates consent to granted or denied', () => {
    const { win } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    setConsent(win, 'accepted')
    setConsent(win, 'rejected')
    const updates = entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')
    expect(updates).toEqual([
      ['consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }],
      ['consent', 'update', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('tracks only allowlisted public pages and the learner area, with harmless query strings', () => {
    for (const p of [
      '/',
      '/?utm_source=google&utm_campaign=women&gclid=abc123&gbraid=x&wbraid=y',
      '/#community',
      '/#ai-assistant',
      '/sign-up',
      '/login',
      '/login?expired=1',
      '/dashboard',
      '/dashboard/',
      '/dashboard/courses/1',
      '/dashboard/courses/1/hana',
      '/dashboard/human-mentors?mentor=7f1c',
      '/dashboard/offers?success=1',
      '/dashboard/offers/1',
      'https://hadafi.potential.org/dashboard/certificates',
    ]) {
      expect([p, isTrackedUrl(p)]).toEqual([p, true])
    }
  })

  it('never tracks pages whose URL can carry a token or code, staff areas or unknown pages', () => {
    for (const p of [
      // token-bearing pages (mentor setup link, announcement unsubscribe), with or without the token
      '/mentor/setup?token=abc',
      '/mentor/setup',
      '/unsubscribe?token=abc',
      '/unsubscribe',
      // secrets in the query string of an otherwise tracked page
      '/sign-up?code=INVITE1',
      '/sign-up?org=ACME42',
      '/login?token=abc',
      '/?key=abc',
      '/?utm_source=x&token=abc',
      '/dashboard?secret=1',
      '/dashboard?TOKEN=abc',
      '/dashboard/offers/1/checkout?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret',
      // params Hadafi's tracked pages never use are unknown, so untracked
      '/sign-up?with=hana',
      '/dashboard?m=someone%40example.com',
      // payment pages (Stripe card form, billing details) and free-text search
      '/dashboard/offers/1/checkout',
      '/dashboard/offers/1/checkout/',
      '/dashboard/billing',
      '/dashboard/payments/1',
      '/dashboard/courses?q=layla%40example.com',
      '/#access_token=abc',
      // staff areas and anything not on the allowlist
      '/admin',
      '/admin/dashboard',
      '/admin/organisations/1/learners/2',
      '/mentor',
      '/mentor/dashboard',
      '/mentor/dashboard/mentees?m=a%40b.c',
      '/partner',
      '/partner/learners/1',
      '/partner/profile',
      '/dashboard-x',
      '/some-new-page',
      'https://evil.example/',
    ]) {
      expect([p, isTrackedUrl(p)]).toEqual([p, false])
    }
  })

  it('after GTM loads, a client-side navigation to an untracked URL becomes a full page load', () => {
    const { win, pushed, nav, navigate } = fakeWindow('/login')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    win.history.pushState(null, '', '/dashboard/courses')
    expect(pushed).toEqual(['/dashboard/courses'])
    win.history.pushState(null, '', '/admin/dashboard')
    win.history.replaceState(null, '', '/unsubscribe?token=abc')
    expect(pushed).toEqual(['/dashboard/courses']) // never reached the real history
    // push -> assign (new entry); replace -> location.replace (no extra entry, Back isn't trapped)
    expect(nav.assigned).toEqual(['https://hadafi.potential.org/admin/dashboard'])
    expect(nav.replaced).toEqual(['https://hadafi.potential.org/unsubscribe?token=abc'])
    expect(win.location.pathname).toBe('/dashboard/courses')
  })

  it('after GTM loads, a fragment carrying values reloads the page without GTM', () => {
    const { win, nav, navigate } = fakeWindow('/')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    let gtmSaw = 0
    win.addEventListener('hashchange', () => gtmSaw++)
    expect(win.hashTo('/#community').stopped).toBe(false)
    expect([nav.reloads, gtmSaw]).toEqual([0, 1])
    expect(win.hashTo('/#access_token=abc').stopped).toBe(true)
    expect([nav.reloads, gtmSaw]).toEqual([1, 1])
  })

  it('after GTM loads, Back/Forward to an untracked URL reloads before any other listener sees it', () => {
    const { win, nav, navigate, listeners } = fakeWindow('/')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    let gtmSaw = 0
    win.addEventListener('popstate', () => gtmSaw++) // stands in for GTM's own listener
    expect(listeners.findIndex((l) => l.type === 'popstate' && l.capture)).toBe(0)
    win.popTo('/dashboard')
    expect([nav.reloads, gtmSaw]).toEqual([0, 1])
    const r = win.popTo('/mentor/setup?token=abc')
    expect(r.stopped).toBe(true)
    expect([nav.reloads, gtmSaw]).toEqual([1, 1])
  })
})

describe('consent store', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  function setup(stored?: 'accepted' | 'rejected') {
    const storage = memoryStorage()
    if (stored) saveChoice(storage, stored, now())
    const { win, appended, cookies, nav, navigate } = fakeWindow()
    const store = createConsentStore({ storage, win, now, navigate })
    return { store, storage, win, appended, cookies, nav }
  }

  it('does nothing while GTM is not configured', () => {
    const { store, win, appended } = setup()
    store.configure(null)
    store.enterPath('/')
    expect(store.getState()).toEqual({ gtmId: null, choice: null, open: false, tracked: false, running: false })
    expect(win.dataLayer).toBeUndefined()
    expect(appended).toHaveLength(0)
    store.openSettings()
    expect(store.getState().open).toBe(false)
    store.trackSignUp('web_form')
    expect(win.dataLayer).toBeUndefined()
  })

  it('opens the banner on a first visit, with consent denied', () => {
    const { store, win, appended } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    expect(store.getState()).toEqual({ gtmId: 'GTM-TEST1234', choice: null, open: true, tracked: true, running: true })
    expect(appended).toHaveLength(1)
    expect((entries(win.dataLayer)[0] as unknown[])[1]).toBe('default')
  })

  it('Accept stores the choice, grants consent and closes', () => {
    const { store, storage, win } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.accept()
    expect(store.getState()).toMatchObject({ choice: 'accepted', open: false })
    expect(readChoice(storage, now())).toBe('accepted')
    expect(entries(win.dataLayer).at(-1)).toEqual(['consent', 'update', GRANTED])
  })

  it('Reject stores the choice, keeps consent denied and clears Google cookies', () => {
    const { store, storage, win, cookies } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.reject()
    expect(store.getState()).toMatchObject({ choice: 'rejected', open: false })
    expect(readChoice(storage, now())).toBe('rejected')
    expect(entries(win.dataLayer).at(-1)).toEqual(['consent', 'update', DENIED])
    const cleared = cookies.map((c) => c.split('=')[0])
    expect(cleared).toContain('_ga')
    expect(cleared).toContain('_ga_ABC')
    expect(cleared).toContain('_gcl_au')
    expect(cleared).not.toContain('session')
    expect(cleared).not.toContain('other')
    // Only this host: host-only cookies and domain=hadafi.potential.org, never
    // the parent domain other Potential.org sites share.
    for (const c of cookies) expect(c).not.toMatch(/domain=\.?potential\.org(;|$)/i)
    expect(cookies.filter((c) => c.startsWith('_ga=')).map((c) => (c.match(/domain=([^;]+)/) ?? [null, 'host-only'])[1])).toEqual([
      'host-only',
      'hadafi.potential.org',
    ])
  })

  it("doesn't show the banner to a returning visitor, and Cookie settings reopens it", () => {
    const { store } = setup('rejected')
    store.configure('GTM-TEST1234')
    store.enterPath('/dashboard')
    expect(store.getState()).toEqual({ gtmId: 'GTM-TEST1234', choice: 'rejected', open: false, tracked: true, running: true })
    store.openSettings()
    expect(store.getState().open).toBe(true)
    store.accept()
    expect(store.getState()).toMatchObject({ choice: 'accepted', open: false })
  })

  it('does not load GTM or show the banner on untracked pages', () => {
    for (const path of ['/admin/dashboard', '/mentor/setup?token=abc', '/unsubscribe?token=abc', '/sign-up?code=INVITE1']) {
      const { store, win, appended, nav } = setup()
      store.configure('GTM-TEST1234')
      store.enterPath(path)
      expect(store.getState()).toMatchObject({ open: false, tracked: false })
      expect(appended).toHaveLength(0)
      expect(win.dataLayer).toBeUndefined()
      expect(nav.reloads).toBe(0) // nothing to unload
      // A later public page in this same document doesn't start it at all
      // (see the "never showed" tests); the next full page load will.
      win.location.href = 'https://hadafi.potential.org/'
      store.enterPath('/')
      expect(appended).toHaveLength(0)
      expect([nav.assigned, nav.reloads]).toEqual([[], 0])
      expect(store.getState().open).toBe(false)
    }
  })

  it('hides the banner and reloads the page when an untracked page is entered after GTM loaded', () => {
    const { store, nav } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    expect(store.getState()).toMatchObject({ open: true, tracked: true })
    store.enterPath('/admin/dashboard')
    expect(store.getState().tracked).toBe(false)
    expect(nav.reloads).toBe(1)
  })

  it('pushes sign_up with the method only, no personal data', () => {
    const { store, win } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/sign-up')
    store.trackSignUp('web_form')
    store.trackSignUp('hana_chat')
    const events = win.dataLayer.filter((e: any) => e?.event === 'sign_up')
    expect(events).toEqual([
      { event: 'sign_up', method: 'web_form' },
      { event: 'sign_up', method: 'hana_chat' },
    ])
  })

  it('notifies subscribers on change', () => {
    const { store } = setup()
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.accept()
    off()
    store.openSettings()
    expect(calls).toBeGreaterThanOrEqual(2)
    const snap = store.getState()
    expect(store.getState()).toBe(snap) // stable snapshot for useSyncExternalStore
  })
})

describe('wiring', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const root = path.join(import.meta.dir, '..', '..', '..')
  const src = (f: string) => readFileSync(path.join(root, f), 'utf8')

  it('the root layout mounts the consent loader on every page', () => {
    expect(src('app/layout.tsx')).toContain('<CookieConsent />')
  })

  it('the loader takes the id from the runtime /public-config, never a hardcoded id', () => {
    const c = src('components/consent/CookieConsent.tsx')
    expect(c).toContain("fetch('/public-config'")
    expect(c).not.toMatch(/GTM-[A-Z0-9]{4,}/)
    expect(src('app/public-config/route.ts')).toContain('process.env.GTM_CONTAINER_ID')
  })

  it('every footer has Cookie settings', () => {
    for (const f of ['components/layout/Footer.tsx', 'components/auth/AuthSplit.tsx', 'views/dashboard/Support.tsx', 'components/shell/AppShell.tsx']) {
      expect(src(f)).toContain('<CookieSettingsLink')
    }
  })
})

describe('redirects after sign-in and setup', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  it('use a full page load for untracked homes once GTM is loaded', () => {
    const { win, nav, navigate } = fakeWindow('/login')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    const pushed: string[] = []
    const push = (h: string) => void pushed.push(h)
    // GTM off: exactly as before (client-side).
    store.go('/admin/dashboard', push)
    expect([pushed, nav.assigned]).toEqual([['/admin/dashboard'], []])
    store.configure('GTM-TEST1234')
    store.enterPath('/login')
    store.go('/dashboard', push)
    for (const home of ['/admin/dashboard', '/mentor/dashboard', '/partner']) store.go(home, push)
    expect(pushed).toEqual(['/admin/dashboard', '/dashboard'])
    expect(nav.assigned).toEqual(['/admin/dashboard', '/mentor/dashboard', '/partner'])
    // A replace (RequireAuth's role redirect) stays a replace: no Back trap.
    store.go('/admin/dashboard', push, 'replace')
    expect(nav.replaced).toEqual(['/admin/dashboard'])
    expect(nav.assigned).toHaveLength(3)
  })

  it('signing out is a full page load (nothing from the last account survives in the document)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.join(import.meta.dir, '..', '..', '..')
    for (const f of ['components/shell/AppShell.tsx', 'views/mentor/Profile.tsx', 'views/partner/Dashboard.tsx', 'components/dashboard/RequireAuth.tsx']) {
      const src = readFileSync(path.join(root, f), 'utf8')
      expect([f, /router\.(push|replace)\(['"]\/login/.test(src)]).toEqual([f, false])
      expect([f, /window\.location\.(assign|replace)\(['"]\/login/.test(src)]).toEqual([f, true])
    }
  })

  it('every staff-capable redirect goes through goTo', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.join(import.meta.dir, '..', '..', '..')
    for (const f of ['views/Login.tsx', 'views/SignUp.tsx', 'components/landing/LandingRegistrationChat.tsx', 'views/mentor/Setup.tsx', 'components/dashboard/RequireAuth.tsx']) {
      const src = readFileSync(path.join(root, f), 'utf8')
      expect([f, /router\.(push|replace)\((homeFor|['"]\/(admin|mentor|partner))/.test(src)]).toEqual([f, false])
      expect([f, src.includes('goTo(')]).toEqual([f, true])
    }
  })
})

describe('leaving a tracked page', () => {
  it("doesn't let a fallback reload cancel the guard's full load to the new URL", () => {
    const { win, nav, navigate } = fakeWindow('/')
    const store = createConsentStore({ storage: memoryStorage(), win, now: () => new Date('2026-11-16T10:00:00Z'), navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    // Next renders the new route, then calls pushState (the guard turns it
    // into a full load), then our route effect sees the new pathname while the
    // address bar still shows the old URL.
    win.history.pushState(null, '', '/mentor/setup?token=abc')
    store.enterPath('/mentor/setup')
    expect(nav.assigned).toEqual(['https://hadafi.potential.org/mentor/setup?token=abc'])
    expect(nav.reloads).toBe(0)
  })
})

describe('GTM only starts in a document that never showed an untracked URL', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  it('an untracked URL earlier in this document: GTM never starts in it, no redirect or reload', () => {
    const { win, appended, nav, navigate } = fakeWindow('/sign-up?code=INVITE1&org=ACME')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.enterPath('/sign-up?code=INVITE1&org=ACME') // before /public-config answers
    store.configure('GTM-TEST1234')
    win.history.pushState(null, '', '/login') // client-side, no guard (GTM isn't running)
    store.enterPath('/login')
    store.enterPath('/')
    expect(appended).toHaveLength(0)
    expect(win.dataLayer).toBeUndefined()
    expect([nav.assigned, nav.replaced, nav.reloads]).toEqual([[], [], 0])
    expect(store.getState()).toMatchObject({ tracked: true, open: false })
    // Nothing is pushed for a sign-up in this document either.
    store.trackSignUp('web_form')
    expect(win.dataLayer).toBeUndefined()
  })

  it('the next full page load on a tracked URL starts fresh', () => {
    const { win, appended, nav, navigate } = fakeWindow('/login')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/login')
    expect([appended.length, nav.reloads, nav.assigned.length]).toEqual([1, 0, 0])
    expect(store.getState()).toMatchObject({ tracked: true, open: true })
  })

  it("checks this document's history entries (Navigation API)", () => {
    const tainted = fakeWindow('/login', {
      entries: [
        { url: 'https://hadafi.potential.org/sign-up?code=INVITE1', sameDocument: true },
        { url: 'https://hadafi.potential.org/login', sameDocument: true },
      ],
    })
    const s1 = createConsentStore({ storage: memoryStorage(), win: tainted.win, now, navigate: tainted.navigate })
    s1.configure('GTM-TEST1234')
    s1.enterPath('/login')
    expect([tainted.appended.length, tainted.nav.assigned, tainted.nav.reloads]).toEqual([0, [], 0])

    // Entries from earlier documents are full navigations away; they don't count.
    const clean = fakeWindow('/login', {
      entries: [
        { url: 'https://hadafi.potential.org/admin/dashboard', sameDocument: false },
        { url: 'https://hadafi.potential.org/login', sameDocument: true },
      ],
    })
    const s2 = createConsentStore({ storage: memoryStorage(), win: clean.win, now, navigate: clean.navigate })
    s2.configure('GTM-TEST1234')
    s2.enterPath('/login')
    expect([clean.appended.length, clean.nav.assigned]).toEqual([1, []])
  })

  it('reads the address bar when /public-config answers, not a stale saved path', () => {
    const { win, appended, navigate } = fakeWindow('/')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.enterPath('/')
    // A query-only change (no new pathname, so no enterPath) before the config arrives.
    win.history.replaceState(null, '', '/sign-up?code=INVITE1')
    store.configure('GTM-TEST1234')
    expect(appended).toHaveLength(0)
    expect(store.getState()).toMatchObject({ tracked: false, open: false })
    // Tainted for good: back on a tracked address, still no GTM in this document.
    win.history.replaceState(null, '', '/')
    store.enterPath('/')
    expect(appended).toHaveLength(0)
  })
})

describe('marketing events (Maya spec)', () => {
  const NOW = new Date('2026-11-16T10:00:00Z')
  const now = () => NOW
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
  const pushedEvents = (win: any) => (win.dataLayer ?? []).filter((e: any) => e && typeof e.event === 'string' && !e.event.startsWith('gtm.'))

  function running(path = '/dashboard', storage = memoryStorage()) {
    const f = fakeWindow(path)
    const store = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    store.configure('GTM-TEST1234')
    store.enterPath(path)
    return { ...f, store, storage }
  }

  const firstStep = (id: string, createdAt: string) => ({
    id,
    type: 'badge',
    dedupeKey: 'badge:first_step',
    title: 'New badge: First step',
    body: 'Complete your first learning step',
    createdAt,
  })
  const cert = (id: string, createdAt: string) => ({
    id,
    type: 'certificate',
    dedupeKey: `certificate:${id}`,
    title: 'You earned a certificate: AI for Layla Haddad Trading LLC',
    body: 'Download it or share it on LinkedIn from Certificates.',
    createdAt,
  })

  it('sign_up_start: once per page per method, method only', () => {
    const { win, store } = running('/sign-up')
    store.trackSignUpStart('web_form')
    store.trackSignUpStart('web_form')
    store.trackSignUpStart('hana_chat')
    store.trackSignUpStart('hana_chat')
    expect(pushedEvents(win)).toEqual([
      { event: 'sign_up_start', method: 'web_form' },
      { event: 'sign_up_start', method: 'hana_chat' },
    ])
  })

  it('no event of any kind on an untracked page, or while GTM is off', () => {
    const r = running('/')
    r.store.enterPath('/mentor/setup?token=abc') // GTM loaded, page untracked (reload pending)
    r.store.trackSignUpStart('web_form')
    r.store.trackSignUp('web_form')
    r.store.noteNotifications([firstStep('n1', ago(1))], 'u1')
    expect(pushedEvents(r.win)).toEqual([])

    const f = fakeWindow('/dashboard')
    const storage = memoryStorage()
    const off = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    off.configure(null)
    off.enterPath('/dashboard')
    off.trackSignUpStart('web_form')
    off.noteNotifications([firstStep('n1', ago(1))], 'u1')
    expect(f.win.dataLayer).toBeUndefined()
    expect(storage.dump()).toEqual({}) // GTM off: nothing stored either
  })

  it('first_lesson_completed: when the first_step badge notification is new, exactly once', () => {
    const { win, store } = running()
    store.noteNotifications([], 'u1') // first fetch: nothing yet
    store.noteNotifications([firstStep('n1', ago(0))], 'u1') // the next poll brings the newly earned badge
    store.noteNotifications([firstStep('n1', ago(0))], 'u1')
    expect(pushedEvents(win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('counts a badge already in the first fetch only if the server created it in the last 10 minutes', () => {
    const recent = running()
    recent.store.noteNotifications([firstStep('n1', ago(2))], 'u1')
    expect(pushedEvents(recent.win)).toEqual([{ event: 'first_lesson_completed' }])
    const old = running()
    old.store.noteNotifications([firstStep('n1', ago(60 * 24))], 'u1')
    expect(pushedEvents(old.win)).toEqual([])
  })

  it('ignores other badges and notifications', () => {
    const { win, store } = running()
    store.noteNotifications([], 'u1')
    store.noteNotifications([
      { id: 'n2', type: 'badge', dedupeKey: 'badge:streak_7', createdAt: ago(0) },
      { id: 'n3', type: 'announcement', dedupeKey: null, createdAt: ago(0) },
    ], 'u1')
    expect(pushedEvents(win)).toEqual([])
  })

  it('course_certificate: once per newly issued certificate, with no course name or ids', () => {
    const { win, store } = running('/dashboard/certificates')
    store.noteNotifications([cert('c0', ago(500))], 'u1') // an old one: not new
    store.noteNotifications([cert('c1', ago(0)), cert('c0', ago(500))], 'u1')
    store.noteNotifications([cert('c1', ago(0)), cert('c0', ago(500))], 'u1')
    expect(pushedEvents(win)).toEqual([{ event: 'course_certificate' }])
    const all = JSON.stringify(win.dataLayer)
    for (const s of ['Layla', 'c1', 'certificate:', 'LinkedIn']) expect(all).not.toContain(s)
  })

  it('another tab or page load in the same browser does not report it again', () => {
    const storage = memoryStorage()
    const a = running('/dashboard', storage)
    a.store.noteNotifications([firstStep('n1', ago(1))], 'u1')
    const b = running('/dashboard/courses', storage)
    b.store.noteNotifications([firstStep('n1', ago(2))], 'u1')
    expect([pushedEvents(a.win).length, pushedEvents(b.win).length]).toEqual([1, 0])
  })

  it('seen where GTM is not running: not consumed, the next page where it runs reports it', () => {
    const storage = memoryStorage()
    const a = running('/', storage)
    a.store.enterPath('/admin/dashboard') // untracked (reload pending)
    a.store.noteNotifications([firstStep('n1', ago(1))], 'u1')
    expect(storage.dump()['hadafi.gtmReported']).toBeUndefined()
    const b = running('/dashboard', storage)
    b.store.noteNotifications([firstStep('n1', ago(2))], 'u1')
    expect([pushedEvents(a.win).length, pushedEvents(b.win)]).toEqual([0, [{ event: 'first_lesson_completed' }]])
  })

  it('a tainted document (invite-code sign-up, then /dashboard client-side) never starts GTM and consumes nothing', () => {
    const storage = memoryStorage()
    const f = fakeWindow('/sign-up?code=INV123')
    const store = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/sign-up?code=INV123')
    f.win.history.pushState(null, '', '/dashboard')
    store.enterPath('/dashboard')
    expect(store.getState()).toMatchObject({ tracked: true, running: false })
    expect(f.win.__hadafiGtmLoaded).toBeUndefined()
    store.noteNotifications([firstStep('n1', ago(1))], 'u1')
    expect(f.win.dataLayer ?? []).toEqual([])
    expect(storage.dump()['hadafi.gtmReported']).toBeUndefined()
    // The next full page load (GTM runs) still reports it.
    const next = running('/dashboard', storage)
    next.store.noteNotifications([firstStep('n1', ago(2))], 'u1')
    expect(pushedEvents(next.win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('another learner signing in in the same tab: their older notifications are not replayed as new', () => {
    const { win, store } = running()
    store.noteNotifications([firstStep('a1', ago(60 * 24))], 'learner-a')
    store.noteNotifications([], 'learner-a')
    // A signs out and B signs in without a page load: B's history is not new.
    store.noteNotifications([firstStep('b1', ago(60 * 24)), cert('b2', ago(300))], 'learner-b')
    expect(pushedEvents(win)).toEqual([])
    // B's own newly earned certificate still counts.
    store.noteNotifications([cert('b3', ago(0)), firstStep('b1', ago(60 * 24)), cert('b2', ago(300))], 'learner-b')
    expect(pushedEvents(win)).toEqual([{ event: 'course_certificate' }])
  })

  it('without localStorage, a list noted again once the user id is known is not reported twice', () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
    const { win, store } = running('/dashboard', blocked as any)
    store.noteNotifications([firstStep('n1', ago(1))], null) // the shell hasn't read the user yet
    store.noteNotifications([firstStep('n1', ago(1))], 'u1')
    expect(pushedEvents(win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('the 10-minute window applies on every fetch, not only the first', () => {
    const { win, store } = running()
    store.noteNotifications([], 'u1')
    store.noteNotifications([cert('c9', ago(60))], 'u1') // not in the first fetch, but an hour old
    expect(pushedEvents(win)).toEqual([])
  })

  it('wiring: the form and Hana report sign_up_start', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.join(import.meta.dir, '..', '..', '..')
    const src = (f: string) => readFileSync(path.join(root, f), 'utf8')
    const signUp = src('views/SignUp.tsx')
    expect(signUp).toMatch(/<form[^>]*onFocusCapture=\{startWebForm\}[^>]*onInputCapture=\{startWebForm\}/)
    expect(signUp).toContain("consentStore.trackSignUpStart('web_form')")
    const chat = src('components/landing/LandingRegistrationChat.tsx')
    expect(chat).toMatch(/const handleRegisterClick = \(\) => \{\s*consentStore\.trackSignUpStart\('hana_chat'\)/)
  })
})
