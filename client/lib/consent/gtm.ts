/**
 * Google Tag Manager with Google Consent Mode v2. Consent starts denied and
 * is set before the container script is added, so no Google tag can store
 * cookies (or use data for ads) until the visitor accepts.
 * Pattern: https://developers.google.com/tag-platform/security/guides/consent
 */
import type { CookieChoice } from './consentStorage'
import { safeNextPath } from '../returnPath'

type ConsentValue = 'granted' | 'denied'
type ConsentState = Record<'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization', ConsentValue>

const all = (v: ConsentValue): ConsentState => ({ ad_storage: v, analytics_storage: v, ad_user_data: v, ad_personalization: v })
export const DENIED: ConsentState = Object.freeze(all('denied')) as ConsentState
export const GRANTED: ConsentState = Object.freeze(all('granted')) as ConsentState

/** How the page is navigated (a stand-in in tests: jsdom can't navigate). */
export interface Navigate {
  assign(url: string): void
  replace(url: string): void
  reload(): void
}

/** The bits of `window` the loader touches (a real window, or a test stand-in). */
export interface GtmWindow {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  __hadafiGtmLoaded?: string
  /** Set when a full page load away from this page has started. */
  __hadafiLeaving?: boolean
  location: { hostname: string; href?: string; assign?(url: string): void; replace?(url: string): void; reload?(): void }
  /** Navigation API (where supported): this tab's history entries. */
  navigation?: { entries(): { url: string | null; sameDocument?: boolean }[] }
  history?: {
    pushState(data: unknown, unused: string, url?: string | URL | null): void
    replaceState(data: unknown, unused: string, url?: string | URL | null): void
  }
  addEventListener?(type: string, listener: (e: { stopImmediatePropagation(): void }) => void, capture?: boolean): void
  document: {
    createElement(tag: 'script'): { src: string; async: boolean }
    head: { appendChild(el: unknown): unknown }
    cookie: string
  }
}

export function browserNavigate(win: GtmWindow): Navigate {
  return {
    assign: (url) => win.location.assign?.(url),
    replace: (url) => win.location.replace?.(url),
    reload: () => win.location.reload?.(),
  }
}

/**
 * GTM runs only on pages checked to carry no secrets in their URL, because
 * Google tags send the full address (page_location). This is an allowlist:
 * a new page is untracked until it is added here. Pages whose links carry a
 * token (/mentor/setup?token=, /unsubscribe?token=), staff areas (/admin,
 * /mentor, /partner: no marketing need, and admin and partner pages show
 * learners' details) and anything unknown (the 404 page) are never tracked.
 */
const TRACKED_PATHS = [/^\/$/, /^\/login$/, /^\/sign-up$/, /^\/dashboard(\/.*)?$/]
/**
 * Inside the tracked paths: payment pages (the offer checkout's Stripe card
 * form, /dashboard/offers/<id>/checkout; billing/payment/invoice pages if added).
 */
const EXCLUDED_PATHS = [/^\/dashboard\/(.*\/)?(checkout|billing|payments?|invoices?)(\/|$)/]
/**
 * Query parameters allowed on a tracked page: the ones Hadafi's tracked pages
 * use (/login?expired=1, /dashboard/human-mentors?mentor=<mentor id>,
 * /dashboard/offers?success=1) and ad/campaign ids, with any value that
 * doesn't look like an email address (see SAFE_PARAM). Anything else (token,
 * code, org, key, secret, Stripe's payment_intent_client_secret, free-text
 * `q` searches on Courses, ...) makes the page untracked. /sign-up?code= and
 * ?org= carry invite/organisation codes.
 */
const SAFE_PARAMS = new Set([
  'expired', 'mentor', 'success',
  'gclid', 'gbraid', 'wbraid', 'dclid', 'gad_source', 'gad_campaignid', '_gl', 'fbclid', 'msclkid', 'li_fat_id',
])
/**
 * Campaign parameters are checked by value too, so personal data pasted into
 * a link (an email, a phone number) makes the page untracked, while ordinary
 * campaign links stay tracked (as SMEEP):
 * - every utm_* (source, medium, campaign, term, content, id, ...): free
 *   text, empty allowed (Sendy tags utm_campaign with the campaign title;
 *   Google Ads fills {keyword}, {creative}, {campaignid}). Untracked only if
 *   the value, decoded and NFKC-normalised (so a full-width '＠' counts),
 *   contains '@' or is over 200 characters.
 * - utm_term only (free search keywords): also untracked if it holds 7+
 *   digits in a row (any script: Arabic-Indic too) once spaces, '-', '.',
 *   '_', '/', '(', ')' and '+' are removed: a phone number.
 * Hadafi has no partner ?ref= links, so `ref` stays untracked.
 */
const UTM_PARAM = /^utm_[a-z_]+$/
const normalised = (v: string): string => {
  let out = v
  try {
    out = decodeURIComponent(v) // URLSearchParams has decoded once; catches a double-encoded %2540
  } catch {
    /* a literal '%' (e.g. "50% off") */
  }
  return out.normalize('NFKC')
}
const PHONE_RUN = /\p{Nd}{7,}/u
const PHONE_SEPARATORS = /[\s\-._/()+]/g
const isSafeUtm = (k: string, v: string): boolean => {
  const n = normalised(v)
  if (n.includes('@') || n.length > 200) return false
  return k !== 'utm_term' || !PHONE_RUN.test(n.replace(PHONE_SEPARATORS, ''))
}
/**
 * Tag Assistant (GTM Preview) opens the site with ?gtm_debug=x (or a
 * timestamp). Without it GTM never loads in debug mode and Preview can't
 * connect. Only those exact values pass.
 */
const GTM_DEBUG = /^(x|\d{1,16})$/
/**
 * `next` (where to go after signing in) is allowed only on /login and
 * /sign-up, and only when it is a safe return path (safeNextPath) that is
 * itself a tracked URL with no `next` of its own: a learner page such as an
 * emailed course link, which GTM sees anyway once the learner lands there.
 * On any other page, or pointing at a staff area, a payment page, a path with
 * an untracked parameter, or anything safeNextPath refuses, it makes the page
 * untracked, so it is never sent.
 */
const NEXT_PAGES = new Set(['/login', '/sign-up'])
const isTrackedNext = (v: string): boolean => {
  const path = safeNextPath(v)
  if (!path) return false
  const u = new URL(path, 'https://hadafi.potential.org')
  return !u.searchParams.has('next') && isTrackedUrl(path)
}
/** `path`: the page's path (no trailing '/'), for parameters allowed on some pages only. */
const SAFE_PARAM = (k: string, v: string, path: string): boolean => {
  // No value of any parameter may look like an email address (decoded once and
  // NFKC-normalised, as for utm_*): ?mentor=a@b.com makes the page untracked.
  if (normalised(v).includes('@')) return false
  if (k === 'gtm_debug') return GTM_DEBUG.test(v)
  if (k === 'next') return NEXT_PAGES.has(path) && isTrackedNext(v)
  if (UTM_PARAM.test(k)) return isSafeUtm(k, v)
  return SAFE_PARAMS.has(k)
}
/** `url` may be relative; an absolute one must be on `origin` (this site). */
export function isTrackedUrl(url: string, origin = 'https://hadafi.potential.org'): boolean {
  let u: URL
  try {
    u = new URL(url, origin)
    if (u.origin !== new URL(origin).origin) return false
  } catch {
    return false
  }
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname
  if (!TRACKED_PATHS.some((re) => re.test(path)) || EXCLUDED_PATHS.some((re) => re.test(path))) return false
  for (const [k, v] of u.searchParams) if (!SAFE_PARAM(k, v, path)) return false
  // Plain in-page anchors only (#community), never a fragment with values.
  return u.hash === '' || /^#[A-Za-z0-9_-]*$/.test(u.hash)
}

function ensureGtag(win: GtmWindow): (...args: unknown[]) => void {
  win.dataLayer = win.dataLayer || []
  if (!win.gtag) {
    // Must push the `arguments` object itself: GTM ignores plain arrays for
    // consent commands.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments)
    }
  }
  return win.gtag
}

/**
 * Once GTM is on the page, an untracked URL must never become the page's
 * address while it runs (GTM and GA4 listen to history changes). Installed
 * before the GTM script, so these wrappers sit under GTM's own:
 * - pushState/replaceState to an untracked URL becomes a full page load
 *   (the real history is never touched, so GTM sees no change);
 * - Back/Forward onto an untracked URL is stopped before any other popstate
 *   listener runs, and the page reloads without GTM.
 */
function installNavigationGuard(win: GtmWindow, nav: Navigate): void {
  const h = win.history
  const here = () => win.location.href ?? `https://${win.location.hostname}/`
  if (h) {
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = h[method].bind(h)
      h[method] = (data: unknown, unused: string, url?: string | URL | null) => {
        if (url != null) {
          const target = new URL(String(url), here())
          if (!isTrackedUrl(target.href, new URL(here()).origin)) {
            win.__hadafiLeaving = true
            // A replace stays a replace, so Back isn't trapped.
            if (method === 'replaceState') nav.replace(target.href)
            else nav.assign(target.href)
            return
          }
        }
        original(data, unused, url)
      }
    }
  }
  // Back/Forward and fragment changes have already changed the address when
  // these fire; stop every later listener (GTM's) and reload without GTM.
  for (const type of ['popstate', 'hashchange']) {
    win.addEventListener?.(
      type,
      (e) => {
        const href = here()
        if (!isTrackedUrl(href, new URL(href).origin)) {
          e.stopImmediatePropagation()
          win.__hadafiLeaving = true
          nav.reload()
        }
      },
      true,
    )
  }
}

/**
 * True if this tab's history has an untracked URL belonging to this document
 * (Navigation API). Entries from earlier documents are full navigations away,
 * so they don't count; without `sameDocument` info every entry counts.
 */
export function historyHasUntrackedEntry(win: GtmWindow): boolean {
  try {
    const entries = win.navigation?.entries() ?? []
    const origin = new URL(win.location.href ?? `https://${win.location.hostname}/`).origin
    return entries.some((e) => e.sameDocument !== false && !!e.url && !isTrackedUrl(e.url, origin))
  } catch {
    return false
  }
}

/**
 * Sets consent to denied, re-applies a stored choice, guards navigation, then
 * adds the GTM container script. Runs once per page; later calls do nothing.
 */
export function bootGtm(win: GtmWindow, gtmId: string, choice: CookieChoice | null, nav: Navigate = browserNavigate(win)): void {
  if (win.__hadafiGtmLoaded) return
  const gtag = ensureGtag(win)
  gtag('consent', 'default', { ...DENIED, wait_for_update: 500 })
  // Strip ad click ids from any request sent while ad storage is denied.
  gtag('set', 'ads_data_redaction', true)
  if (choice === 'accepted') gtag('consent', 'update', { ...GRANTED })
  installNavigationGuard(win, nav)
  win.dataLayer!.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
  const script = win.document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`
  win.document.head.appendChild(script)
  win.__hadafiGtmLoaded = gtmId
}

export function setConsent(win: GtmWindow, choice: CookieChoice): void {
  if (!win.__hadafiGtmLoaded) return
  ensureGtag(win)('consent', 'update', { ...(choice === 'accepted' ? GRANTED : DENIED) })
}

/** Google Analytics / Ads cookie names (_ga, _ga_<id>, _gid, _gat*, _gcl_*). */
const GOOGLE_COOKIE = /^(_ga(_.+)?|_gid|_gat.*|_gcl_.+)$/

/**
 * Removes Google's analytics/ads cookies when someone rejects after having
 * accepted: only this site's own (host-only, or set for this exact host).
 * Never the parent domain: other Potential.org sites share it and keep their
 * own consent.
 */
export function clearGoogleCookies(win: GtmWindow): void {
  let names: string[]
  try {
    names = win.document.cookie
      .split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((n) => GOOGLE_COOKIE.test(n))
  } catch {
    return
  }
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  for (const name of [...new Set(names)]) {
    win.document.cookie = `${name}=; ${expired}`
    win.document.cookie = `${name}=; ${expired}; domain=${win.location.hostname}`
  }
}
