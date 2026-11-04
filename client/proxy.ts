import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Fast, optimistic gate: no Better Auth session cookie means not signed in,
// so go straight to /login instead of rendering a dashboard first. It only
// checks that the cookie exists. Whether the session is real, and which role
// it has, is decided by the API on every request and by RequireAuth on the
// page (which sends a signed-in user to their own dashboard).
export function proxy(req: NextRequest) {
  if (getSessionCookie(req, { cookiePrefix: 'hadafi' })) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // /mentor/setup is a public page — only protect the signed-in paths.
  matcher: ['/dashboard/:path*', '/admin/:path*', '/mentor/dashboard/:path*', '/partner/:path*'],
}
