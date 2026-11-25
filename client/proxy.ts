import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { withNext } from './lib/returnPath'

// Fast, optimistic gate: no Better Auth session cookie means not signed in,
// so go straight to /login instead of rendering a dashboard first. It only
// checks that the cookie exists. Whether the session is real, and which role
// it has, is decided by the API on every request and by RequireAuth on the
// page (which sends a signed-in user to their own dashboard).
export function proxy(req: NextRequest) {
  if (getSessionCookie(req, { cookiePrefix: 'hadafi' })) return NextResponse.next()
  return NextResponse.redirect(loginRedirectUrl(req.nextUrl))
}

/**
 * /login?next=<the page asked for> on the same host, so signing in returns
 * there (an emailed course link). The page asked for is dropped if it fails
 * safeNextPath (e.g. too long); /login then signs in to the usual home.
 */
function loginRedirectUrl(requested: { href: string; origin: string; pathname: string; search: string }): URL {
  const url = new URL(requested.href)
  const target = new URL(withNext('/login', `${requested.pathname}${requested.search}`), url.origin)
  url.pathname = target.pathname
  url.search = target.search
  url.hash = ''
  return url
}

export const config = {
  // /mentor/setup is a public page — only protect the signed-in paths.
  matcher: ['/dashboard/:path*', '/admin/:path*', '/mentor/dashboard/:path*', '/partner/:path*'],
}
