/**
 * Cookie consent state for the whole site: whether GTM is configured, the
 * visitor's choice, whether the banner is open, and whether the current page
 * may be tracked. React reads it through useSyncExternalStore (see
 * components/consent).
 */
import { readChoice, saveChoice, type CookieChoice, type KeyValueStorage } from './consentStorage'
import {
  bootGtm,
  browserNavigate,
  clearGoogleCookies,
  historyHasUntrackedEntry,
  isTrackedUrl,
  setConsent,
  type GtmWindow,
  type Navigate,
} from './gtm'

export interface CookieConsentState {
  /** The GTM container id, or null: GTM off, no banner, nothing tracked. */
  gtmId: string | null
  choice: CookieChoice | null
  open: boolean
  /** The current page is on the allowlist (isTrackedUrl). */
  tracked: boolean
  /**
   * GTM is loaded in this document. `tracked` alone is not enough: in a
   * document that has shown an untracked URL GTM never starts, although a
   * later page in it (e.g. /dashboard after an invite-code sign-up) is tracked.
   */
  running: boolean
}

export type SignUpMethod = 'web_form' | 'hana_chat'

/**
 * Every event the site sends to GTM, in full: the event name and a method at
 * most. Nothing about the person (name, email, phone, country), no course
 * name and no ids, ever.
 */
export type MarketingEvent =
  | { event: 'sign_up'; method: SignUpMethod }
  | { event: 'sign_up_start'; method: SignUpMethod }
  | { event: 'first_lesson_completed' }
  | { event: 'course_certificate' }
  /**
   * The visitor clicked Accept on this page (not a choice restored at page
   * load). Tags blocked at page view fire on a "consent_update" custom-event
   * trigger, so the landing page itself is measured.
   */
  | { event: 'consent_update'; consent: 'granted' }

/** A notification as GET /api/me/notifications returns it (fields used here). */
export interface NotificationLike {
  id: string
  type: string
  dedupeKey?: string | null
  createdAt: string
}

/**
 * The server creates these notifications exactly once per learner (dedupe
 * keys badge:first_step and certificate:<id>) at the moment the badge is
 * earned or the certificate issued, so they are its "newly earned" signal.
 */
function eventForNotification(n: NotificationLike): MarketingEvent | null {
  if (n.type === 'badge' && n.dedupeKey === 'badge:first_step') return { event: 'first_lesson_completed' }
  if (n.type === 'certificate') return { event: 'course_certificate' }
  return null
}

/** A notification already there on the first fetch counts as new if this recent. */
const RECENT_MS = 10 * 60_000
/** Notification ids already handled in this browser (other tabs, later pages). */
const REPORTED_KEY = 'hadafi.gtmReported'

interface Deps {
  storage: () => KeyValueStorage | null | undefined
  win: () => GtmWindow | undefined
  now: () => Date
  navigate: () => Navigate | undefined
}

interface PlainDeps {
  storage?: KeyValueStorage
  win?: GtmWindow
  now?: () => Date
  navigate?: Navigate
}

export function createConsentStore(deps: PlainDeps | Deps = {}) {
  const d: Deps =
    typeof (deps as Deps).win === 'function'
      ? (deps as Deps)
      : {
          storage: () => (deps as PlainDeps).storage,
          win: () => (deps as PlainDeps).win,
          now: (deps as PlainDeps).now ?? (() => new Date()),
          navigate: () => {
            const p = deps as PlainDeps
            return p.navigate ?? (p.win ? browserNavigate(p.win) : undefined)
          },
        }
  let state: CookieConsentState = { gtmId: null, choice: null, open: false, tracked: false, running: false }
  let url: string | null = null
  let asked = false // the banner opens by itself at most once per page load
  // This document has shown an untracked URL (a token, invite code, staff
  // page...). GTM never starts in it: on pagehide or Back its tags could read
  // that address. The next full page load on a tracked URL starts fresh.
  let tainted = false
  let opener: { focus(): void; isConnected?: boolean } | null = null
  const started = new Set<SignUpMethod>() // sign_up_start sent on this page
  let consentSignalled = false // consent_update sent on this page
  // Ids in this document's noted fetches, for the signed-in user they belong
  // to: another account signing in (no page load between) starts afresh.
  let seenNotifications: Set<string> | null = null
  let seenFor: string | null = null
  // Ids whose event this document pushed (whoever was signed in): stops a
  // repeat when localStorage is unavailable.
  const pushedHere = new Set<string>()
  const listeners = new Set<() => void>()

  const set = (next: Partial<CookieConsentState>) => {
    const merged = { ...state, ...next }
    if (
      merged.gtmId === state.gtmId &&
      merged.choice === state.choice &&
      merged.open === state.open &&
      merged.tracked === state.tracked &&
      merged.running === state.running
    )
      return
    state = merged
    listeners.forEach((l) => l())
  }

  const gtmLoaded = () => !!d.win()?.__hadafiGtmLoaded

  /** Pushes only while GTM runs on a tracked page; returns whether it did. */
  const push = (e: MarketingEvent): boolean => {
    const win = d.win()
    if (!state.gtmId || !state.tracked || !state.running || !win?.__hadafiGtmLoaded) return false
    win.dataLayer = win.dataLayer || []
    win.dataLayer.push({ ...e })
    return true
  }

  const reported = (): string[] => {
    try {
      const v = JSON.parse(d.storage()?.getItem(REPORTED_KEY) ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  const markReported = (id: string) => {
    try {
      d.storage()?.setItem(REPORTED_KEY, JSON.stringify([...reported(), id].slice(-50)))
    } catch {
      /* private mode: pushedHere still stops repeats in this document */
    }
  }

  /** The address bar right now (path + query + fragment), if readable. */
  const currentAddress = (win: GtmWindow): string | null => {
    const href = win.location.href
    if (!href) return null
    try {
      const u = new URL(href)
      return u.pathname + u.search + u.hash
    } catch {
      return null
    }
  }

  /**
   * On a tracked page of a clean document: start GTM and ask for a choice.
   * On any other page: hide the banner, and if GTM is already running (a
   * client-side move from a tracked page), reload so this page runs without it.
   */
  const sync = () => {
    const win = d.win()
    if (!state.gtmId || !win || url === null) return
    // Both the route React reports and the real address bar (a query-only
    // change doesn't produce a new pathname) must be tracked.
    const address = currentAddress(win)
    const tracked = isTrackedUrl(url) && (address === null || isTrackedUrl(address))
    set({ tracked, running: gtmLoaded() })
    if (!tracked) {
      tainted = true
      // Fallback only: the history guard has normally started a full load to
      // the new URL already, and reloading here would cancel it.
      if (gtmLoaded() && !win.__hadafiLeaving) {
        win.__hadafiLeaving = true
        d.navigate()?.reload()
      }
      return
    }
    // GTM never starts in a document that has shown an untracked URL: Back
    // could bring that address back while tags run (Chrome keeps pushState
    // entries same-document even across a reload). No redirect to "clean"
    // it: the next full page load on a tracked URL starts fresh.
    if (!win.__hadafiGtmLoaded && (tainted || historyHasUntrackedEntry(win))) {
      tainted = true
      return
    }
    bootGtm(win, state.gtmId, state.choice, d.navigate() ?? browserNavigate(win))
    set({ running: gtmLoaded() })
    if (!asked) {
      asked = true
      if (state.choice === null) set({ open: true })
    }
  }

  const closeAndRestoreFocus = (next: Partial<CookieConsentState>) => {
    set({ ...next, open: false })
    const el = opener
    opener = null
    if (el && el.isConnected !== false) el.focus()
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Called with the validated container id from /public-config (null = off). */
    configure(gtmId: string | null) {
      if (!gtmId) {
        set({ gtmId: null, choice: null, open: false, tracked: false, running: false })
        return
      }
      set({ gtmId, choice: readChoice(d.storage(), d.now()) })
      sync()
    },
    /** Called on every page (client-side navigations included) with path + query. */
    enterPath(pathAndQuery: string) {
      url = pathAndQuery
      // Remembered even while /public-config hasn't answered yet.
      if (!isTrackedUrl(pathAndQuery)) tainted = true
      sync()
    },
    accept() {
      if (!state.gtmId) return
      const wasAccepted = state.choice === 'accepted'
      saveChoice(d.storage(), 'accepted', d.now())
      const win = d.win()
      if (win) setConsent(win, 'accepted')
      // Only on the move to accepted (first choice, or from rejected via
      // Cookie settings), after the consent update, at most once per page.
      // A choice restored at page load needs none: consent was granted before
      // GTM's page view.
      if (!wasAccepted && !consentSignalled && push({ event: 'consent_update', consent: 'granted' })) consentSignalled = true
      closeAndRestoreFocus({ choice: 'accepted' })
    },
    reject() {
      if (!state.gtmId) return
      saveChoice(d.storage(), 'rejected', d.now())
      const win = d.win()
      if (win) {
        setConsent(win, 'rejected')
        clearGoogleCookies(win)
      }
      closeAndRestoreFocus({ choice: 'rejected' })
    },
    /** The footer's "Cookie settings"; focus returns to `from` after a choice. */
    openSettings(from?: { focus(): void; isConnected?: boolean } | null) {
      if (!state.gtmId || !state.tracked) return
      opener = from ?? null
      set({ open: true })
    },
    closeBanner() {
      closeAndRestoreFocus({})
    },
    /**
     * Navigates after sign-in or setup. Untracked targets (staff homes) get a
     * full page load while GTM is running, so GTM is gone there; otherwise
     * the usual client-side navigation.
     */
    go(href: string, move: (href: string) => void, mode: 'push' | 'replace' = 'push') {
      const win = d.win()
      if (win && gtmLoaded() && !isTrackedUrl(href)) {
        win.__hadafiLeaving = true
        if (mode === 'replace') d.navigate()?.replace(href)
        else d.navigate()?.assign(href)
      }
      else move(href)
    },
    /**
     * Tells GTM an account was created. Only the method: never the name,
     * email or anything else about the person.
     */
    trackSignUp(method: SignUpMethod) {
      push({ event: 'sign_up', method })
    },
    /** The visitor began signing up (first touch of the form, or Hana's "I want to register"). Once per page. */
    trackSignUpStart(method: SignUpMethod) {
      if (started.has(method)) return
      if (push({ event: 'sign_up_start', method })) started.add(method)
    },
    /**
     * Called with each notifications fetch of the signed-in user `userId`. A
     * first_step badge or certificate notification created in the last 10
     * minutes, not in this page's earlier fetches for that user and not handled
     * before in this browser, is reported once.
     *
     * Only while GTM runs on a tracked page: anywhere else (GTM off, an
     * untracked page, a document where GTM never started) the fetch is not
     * noted at all, so nothing is consumed and the next page where GTM runs
     * still reports it if it is recent. An id is marked handled only once
     * its event has been pushed.
     */
    noteNotifications(items: NotificationLike[], userId: string | null) {
      if (!state.gtmId || !state.tracked || !state.running) return
      if (userId !== seenFor) {
        seenFor = userId
        seenNotifications = null
      }
      const seen = seenNotifications ?? new Set<string>()
      const nowMs = d.now().getTime()
      const done = new Set(reported())
      for (const n of items) {
        const e = eventForNotification(n)
        if (!e || done.has(n.id) || pushedHere.has(n.id) || seen.has(n.id)) continue
        const created = Date.parse(n.createdAt)
        if (!Number.isFinite(created) || Math.abs(nowMs - created) > RECENT_MS) continue
        if (!push(e)) continue
        pushedHere.add(n.id)
        done.add(n.id)
        markReported(n.id)
      }
      seenNotifications = new Set([...seen, ...items.map((n) => n.id)])
    },
  }
}

export type ConsentStore = ReturnType<typeof createConsentStore>

/** The site's store, bound to the browser's window and localStorage. */
export const consentStore: ConsentStore = createConsentStore({
  storage: () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  },
  win: () => (typeof window === 'undefined' ? undefined : (window as unknown as GtmWindow)),
  now: () => new Date(),
  navigate: () => (typeof window === 'undefined' ? undefined : browserNavigate(window as unknown as GtmWindow)),
})

/**
 * Router-friendly wrapper for consentStore.go: `goTo(router, homeFor(role))`,
 * or `{ replace: true }` for a redirect that shouldn't add a history entry.
 */
export function goTo(
  router: { push(href: string): void; replace?(href: string): void },
  href: string,
  opts: { replace?: boolean } = {},
): void {
  if (opts.replace && router.replace) consentStore.go(href, (h) => router.replace!(h), 'replace')
  else consentStore.go(href, (h) => router.push(h))
}
