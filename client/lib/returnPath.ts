/**
 * Where to go after signing in: the `next` parameter on /login and /sign-up.
 *
 * A signed-out visitor who opens a deep link (an emailed course link) is sent
 * to /login?next=<that path>, and lands back on it after signing in. `next`
 * comes from the address bar, so anyone can craft it: it is only ever used
 * after safeNextPath has accepted it, which allows nothing but a same-site
 * path inside the signed-in areas. No imports: proxy.ts uses this too.
 */

/** Longest `next` accepted (the whole value, before decoding). */
export const NEXT_MAX_LENGTH = 2000

/** The signed-in areas (the paths proxy.ts protects). */
export const NEXT_AREAS = ['/dashboard', '/admin', '/mentor/dashboard', '/partner'] as const

export type Role = 'sme' | 'mentor' | 'admin' | 'partner'

/** The one area each role can use (RequireAuth checks the exact role). */
const ROLE_AREA: Record<Role, (typeof NEXT_AREAS)[number]> = {
  sme: '/dashboard',
  admin: '/admin',
  mentor: '/mentor/dashboard',
  partner: '/partner',
}

/** Any control character (C0, DEL, C1): a browser drops tabs/newlines, so "/\t/evil" would become "//evil". */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

/** A path on this site: one leading '/', never '//' (another host), no '\' (browsers read it as '/'), no control characters. */
function plainPath(s: string): boolean {
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') && !CONTROL.test(s)
}

/** `path` is `area` or below it: "/dashboard" and "/dashboard/x" yes, "/dashboardx" no. */
function inArea(path: string, area: string): boolean {
  return path === area || path.startsWith(`${area}/`)
}

const BASE = 'https://next.invalid'

/**
 * Area roots with no page of their own, and the page to use instead
 * (/admin has none; /dashboard, /mentor/dashboard and /partner do).
 */
const AREA_ROOT_PAGE: Record<string, string> = { '/admin': '/admin/dashboard', '/admin/': '/admin/dashboard' }

/**
 * The `next` value as a safe same-site path (normalised: dot segments
 * resolved), or null. Rejects anything that is not a plain path, both as
 * given and decoded once (so "%2F%2Fevil.com" or "%5C" fail too), anything
 * over NEXT_MAX_LENGTH, and paths outside NEXT_AREAS.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > NEXT_MAX_LENGTH) return null
  if (!plainPath(raw)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null // a malformed escape: not something we sent
  }
  if (!plainPath(decoded)) return null
  let u: URL
  try {
    u = new URL(raw, BASE)
  } catch {
    return null
  }
  if (u.origin !== BASE) return null
  // Check the path as the browser will resolve it ("/dashboard/../admin" is /admin),
  // and its decoded form ("/dashboard/%2e%2e/admin").
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(u.pathname)
  } catch {
    return null
  }
  if (decodedPath.split('/').some((seg) => seg === '..' || seg === '.')) return null
  if (!NEXT_AREAS.some((area) => inArea(u.pathname, area))) return null
  if (AREA_ROOT_PAGE[u.pathname]) u.pathname = AREA_ROOT_PAGE[u.pathname]
  const out = `${u.pathname}${u.search}${u.hash}`
  return plainPath(out) && out.length <= NEXT_MAX_LENGTH ? out : null
}

/**
 * The safe `next` for a user with `role`, or null when there is none or it
 * is outside the area that role can use (a learner given next=/admin/...):
 * the caller then uses the role's usual home instead of a page that bounces.
 */
export function nextForRole(raw: unknown, role: Role): string | null {
  const path = safeNextPath(raw)
  if (!path) return null
  const pathname = new URL(path, BASE).pathname
  return inArea(pathname, ROLE_AREA[role]) ? path : null
}

/**
 * `base` (e.g. "/login" or "/login?expired=1") with `next` added when it is
 * safe; `base` unchanged otherwise.
 */
export function withNext(base: string, next: unknown): string {
  const path = safeNextPath(next)
  if (!path) return base
  return `${base}${base.includes('?') ? '&' : '?'}next=${encodeURIComponent(path)}`
}

/** The raw `next` in this page's address (browser only; null on the server). */
export function nextInLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('next')
}
