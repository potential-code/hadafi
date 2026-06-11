import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_NAME = 'smeep_token'

function getDashboardForRole(role: string): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'mentor') return '/mentor/dashboard'
  return '/dashboard'
}

// Decode JWT payload without verifying the signature.
// Edge runtime has no Node crypto, so verification happens on every real API
// call via Express. This cookie gate is only for fast UX redirects.
function decodeRole(token: string): string | null {
  try {
    const payloadB64 = token.split('.')[1]
    if (!payloadB64) return null
    const payload = JSON.parse(atob(payloadB64)) as { role?: string }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const token = req.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const role = decodeRole(token)

  if (!role) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect to the correct dashboard if the role does not match the path group
  if (pathname.startsWith('/admin') && role !== 'admin') {
    const url = req.nextUrl.clone()
    url.pathname = getDashboardForRole(role)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/mentor') && role !== 'mentor') {
    const url = req.nextUrl.clone()
    url.pathname = getDashboardForRole(role)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/dashboard') && role !== 'sme') {
    const url = req.nextUrl.clone()
    url.pathname = getDashboardForRole(role)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // /mentor/setup is a public page — only protect authenticated mentor paths
  matcher: ['/dashboard/:path*', '/admin/:path*', '/mentor/dashboard/:path*'],
}
