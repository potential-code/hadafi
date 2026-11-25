import { describe, expect, it } from 'bun:test'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { safeNextPath } from '../lib/returnPath'

const ORIGIN = 'https://hadafi.potential.org'
const COURSE = '/dashboard/courses/e0999a0f-8c95-4365-8c28-6fc812610df8'

function run(path: string, cookie?: string) {
  const req = new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined)
  return proxy(req)
}

function redirectTarget(path: string): URL {
  const res = run(path)
  expect([302, 307, 308]).toContain(res.status)
  return new URL(res.headers.get('location')!)
}

describe('proxy', () => {
  it('sends a signed-out deep link to /login?next=<path>', () => {
    const to = redirectTarget(COURSE)
    expect(to.origin).toBe(ORIGIN)
    expect(to.pathname).toBe('/login')
    expect(to.searchParams.get('next')).toBe(COURSE)
    expect([...to.searchParams.keys()]).toEqual(['next'])
  })

  it('keeps the query, encoded inside next (not merged into /login\'s own query)', () => {
    const to = redirectTarget(`${COURSE}?tab=units&unit=3`)
    expect(to.pathname).toBe('/login')
    expect([...to.searchParams.keys()]).toEqual(['next'])
    expect(to.searchParams.get('next')).toBe(`${COURSE}?tab=units&unit=3`)
    // The raw Location is encoded: no bare '&' or '?' from the original query.
    const raw = run(`${COURSE}?tab=units&unit=3`).headers.get('location')!
    expect(raw).toBe(`${ORIGIN}/login?next=${encodeURIComponent(`${COURSE}?tab=units&unit=3`)}`)
  })

  it.each(['/dashboard', '/admin/learners', '/mentor/dashboard/sessions', '/partner', '/partner/profile', '/partner/learners/9'])(
    'protects %s',
    (path) => {
      const to = redirectTarget(path)
      expect(to.pathname).toBe('/login')
      expect(to.searchParams.get('next')).toBe(path)
    },
  )

  it('gives a next that the login page accepts', () => {
    const to = redirectTarget(`${COURSE}?q=a%20b`)
    expect(safeNextPath(to.searchParams.get('next'))).toBe(`${COURSE}?q=a%20b`)
  })

  it('drops next when the page asked for is not a safe return path (too long)', () => {
    const to = redirectTarget(`/dashboard?x=${'a'.repeat(2100)}`)
    expect(to.pathname).toBe('/login')
    expect(to.search).toBe('')
  })

  it('lets a request with a session cookie through', () => {
    const res = run(COURSE, 'hadafi.session_token=abc.def')
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
