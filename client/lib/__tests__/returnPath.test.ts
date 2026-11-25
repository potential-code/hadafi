import { describe, expect, it } from 'bun:test'
import { NEXT_MAX_LENGTH, nextForRole, safeNextPath, withNext } from '../returnPath'

const COURSE = '/dashboard/courses/e0999a0f-8c95-4365-8c28-6fc812610df8'

describe('safeNextPath: accepted', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    [COURSE, COURSE],
    [`${COURSE}?tab=units&unit=3`, `${COURSE}?tab=units&unit=3`],
    [`${COURSE}#lesson-2`, `${COURSE}#lesson-2`],
    // /admin has no page: its default page instead (the other roots have pages)
    ['/admin', '/admin/dashboard'],
    ['/admin/', '/admin/dashboard'],
    ['/admin?tab=x', '/admin/dashboard?tab=x'],
    ['/admin/dashboard', '/admin/dashboard'],
    ['/dashboard/', '/dashboard/'],
    ['/admin/learners/42', '/admin/learners/42'],
    ['/mentor/dashboard', '/mentor/dashboard'],
    ['/mentor/dashboard/sessions', '/mentor/dashboard/sessions'],
    ['/partner', '/partner'],
    ['/partner/learners/7', '/partner/learners/7'],
    ['/dashboard/search?q=a%20b', '/dashboard/search?q=a%20b'],
    // dot segments are resolved, then checked
    ['/dashboard/./courses', '/dashboard/courses'],
    ['/dashboard/courses/../events', '/dashboard/events'],
  ])('%s', (input, out) => {
    expect(safeNextPath(input)).toBe(out)
  })
})

describe('safeNextPath: rejected', () => {
  it.each([
    // not a string / empty / too long
    [undefined],
    [null],
    [42],
    [['/dashboard']],
    [''],
    [`/dashboard/${'a'.repeat(NEXT_MAX_LENGTH)}`],
    // other hosts and schemes
    ['//evil.com'],
    ['//evil.com/dashboard'],
    ['///evil.com'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['/dashboard\\..\\..\\evil'],
    ['https://evil.com/dashboard'],
    ['http://hadafi.potential.org/dashboard'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)//dashboard'],
    ['data:text/html,<script>alert(1)</script>'],
    ['dashboard'],
    [' /dashboard'],
    // control characters (browsers drop tab/newline: "/\t/evil" would be "//evil")
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/dashboard\r\nSet-Cookie: x=1'],
    ['/dashboard\u0000'],
    ['/dashboard\u007f'],
    ['/dashboard\u0085'],
    // encoded variants, decoded once
    ['/%2Fevil.com'],
    ['/%2f%2fevil.com'],
    ['%2F%2Fevil.com'],
    ['/%5Cevil.com'],
    ['/dashboard/%5C..%5Cadmin'],
    ['/%09/evil.com'],
    ['/dashboard%0d%0aSet-Cookie:x'],
    ['/dashboard%00'],
    ['/dashboard/%2e%2e/%2e%2e//evil.com'],
    ['/dashboard%2F..%2F..%2Fadmin'],
    ['/dashboard/%E0%A4%A'], // malformed escape
    // outside the signed-in areas, or only a prefix match
    ['/'],
    ['/login'],
    ['/sign-up'],
    ['/dashboardx'],
    ['/dashboard-evil'],
    ['/administrator'],
    ['/mentor'],
    ['/mentor/setup'],
    ['/mentor/dashboardx'],
    ['/partners'],
    ['/api/auth/sign-out'],
    ['/unsubscribe?token=x'],
    ['/dashboard/../login'],
    ['/dashboard/../../evil.com'],
    ['/dashboard/..//evil.com'],
  ])('%p', (input) => {
    expect(safeNextPath(input)).toBeNull()
  })

  it('rejects a protocol-relative URL even when it names the parser base host', () => {
    // Only the leading-'//' check catches this one: it resolves to the same
    // origin as the internal base, inside /dashboard.
    expect(safeNextPath('//next.invalid/dashboard')).toBeNull()
    expect(safeNextPath('//next.invalid/dashboard/courses/1')).toBeNull()
  })

  it('checks the length before normalising (dot segments could shrink an overlong value)', () => {
    const raw = `/dashboard/${'x/../'.repeat(420)}courses`
    expect(raw.length).toBeGreaterThan(NEXT_MAX_LENGTH)
    expect(new URL(raw, 'https://a.invalid').pathname).toBe('/dashboard/courses')
    expect(safeNextPath(raw)).toBeNull()
  })

  it('accepts a path right at the length limit and rejects one over it', () => {
    const atLimit = `/dashboard/${'a'.repeat(NEXT_MAX_LENGTH - '/dashboard/'.length)}`
    expect(atLimit.length).toBe(NEXT_MAX_LENGTH)
    expect(safeNextPath(atLimit)).toBe(atLimit)
    expect(safeNextPath(`${atLimit}a`)).toBeNull()
  })
})

describe('nextForRole', () => {
  it('returns next inside the area the role can use', () => {
    expect(nextForRole(COURSE, 'sme')).toBe(COURSE)
    expect(nextForRole('/admin/learners', 'admin')).toBe('/admin/learners')
    expect(nextForRole('/admin', 'admin')).toBe('/admin/dashboard')
    expect(nextForRole('/partner', 'partner')).toBe('/partner')
    expect(nextForRole('/mentor/dashboard', 'mentor')).toBe('/mentor/dashboard')
    expect(nextForRole('/mentor/dashboard/sessions', 'mentor')).toBe('/mentor/dashboard/sessions')
    expect(nextForRole('/partner/learners/1', 'partner')).toBe('/partner/learners/1')
  })

  it('is null for another role\'s area (the caller falls back to the role home)', () => {
    expect(nextForRole('/admin/learners', 'sme')).toBeNull()
    expect(nextForRole(COURSE, 'admin')).toBeNull()
    expect(nextForRole(COURSE, 'mentor')).toBeNull()
    expect(nextForRole('/partner', 'sme')).toBeNull()
    expect(nextForRole('/mentor/dashboard', 'partner')).toBeNull()
  })

  it('is null for an unsafe or missing next', () => {
    expect(nextForRole(null, 'sme')).toBeNull()
    expect(nextForRole('//evil.com/dashboard', 'sme')).toBeNull()
    expect(nextForRole('/dashboard/../admin', 'sme')).toBeNull()
  })
})

describe('withNext', () => {
  it('adds an encoded next to a base with or without a query', () => {
    expect(withNext('/login', `${COURSE}?a=1&b=2`)).toBe(`/login?next=${encodeURIComponent(`${COURSE}?a=1&b=2`)}`)
    expect(withNext('/login?expired=1', COURSE)).toBe(`/login?expired=1&next=${encodeURIComponent(COURSE)}`)
  })

  it('leaves the base unchanged for an unsafe next', () => {
    expect(withNext('/login', '//evil.com')).toBe('/login')
    expect(withNext('/sign-up', 'javascript:alert(1)')).toBe('/sign-up')
    expect(withNext('/login', null)).toBe('/login')
  })

  it('round-trips through URLSearchParams', () => {
    const href = withNext('/login', `${COURSE}?q=a%20b&x=<script>`)
    const got = new URL(href, 'https://hadafi.potential.org').searchParams.get('next')
    expect(safeNextPath(got)).toBe(safeNextPath(`${COURSE}?q=a%20b&x=<script>`))
  })
})
