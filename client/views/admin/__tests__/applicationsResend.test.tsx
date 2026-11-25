/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/fetch */
import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test'
// jsdom is a test-only dependency here without @types/jsdom; the root typecheck has noImplicitAny.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JSDOM } from 'jsdom'

/**
 * Mentor Applications (views/admin/Applications.tsx) in a real DOM (jsdom)
 * with the API stubbed: "Resend setup link" shows only for approved mentors
 * without an account, calls the resend route once while it is in flight, and
 * reports the result. The server side is server/tests/mentor-resend-setup.test.ts.
 */

const g = globalThis as any
const saved: Record<string, unknown> = {}
const KEYS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'CustomEvent',
  'MutationObserver',
  'HTMLInputElement',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
]
let React: typeof import('react')
let act: typeof import('react').act
let createRoot: typeof import('react-dom/client').createRoot
let QueryClient: typeof import('@tanstack/react-query').QueryClient
let QueryClientProvider: typeof import('@tanstack/react-query').QueryClientProvider
let ApplicationsPage: typeof import('../Applications').default
let canResendSetup: typeof import('@/components/admin/ResendSetupButton').canResendSetup
let toast: typeof import('sonner').toast

// The admin shell (navigation, session) is not under test: render the page body only.
mock.module('@/components/admin/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: unknown }) => children,
}))

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://hadafi.test/admin/applications', pretendToBeVisual: true })
  for (const k of KEYS) saved[k] = g[k]
  g.window = dom.window
  g.document = dom.window.document
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'CustomEvent', 'MutationObserver', 'HTMLInputElement']) g[k] = (dom.window as any)[k]
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
  g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
  g.IS_REACT_ACT_ENVIRONMENT = true
  React = await import('react')
  act = React.act
  ;({ createRoot } = await import('react-dom/client'))
  ;({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'))
  ;({ default: ApplicationsPage } = await import('../Applications'))
  ;({ canResendSetup } = await import('@/components/admin/ResendSetupButton'))
  ;({ toast } = await import('sonner'))
})

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'navigator') Object.defineProperty(g, 'navigator', { value: v, configurable: true, writable: true })
    else if (v === undefined) delete g[k]
    else g[k] = v
  }
})

const base = { linkedinUrl: null, hourlyRate: null, expertise: [], methods: [], passion: null, createdAt: '2026-11-01T10:00:00Z' }
const APPS = [
  { ...base, id: 'a-pending', name: 'Pending Person', email: 'pending@example.test', status: 'pending', hasAccount: false },
  { ...base, id: 'a-waiting', name: 'Waiting Mentor', email: 'waiting@example.test', status: 'approved', hasAccount: false },
  { ...base, id: 'a-done', name: 'Active Mentor', email: 'active@example.test', status: 'approved', hasAccount: true },
  { ...base, id: 'a-rejected', name: 'Rejected Person', email: 'rejected@example.test', status: 'rejected', hasAccount: false },
]

type Call = { method: string; path: string }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Stubs fetch: the list answers APPS; the resend route answers `resend()` (awaited, so a test can hold it open). */
function stubApi(resend: () => Promise<Response> | Response) {
  const calls: Call[] = []
  g.fetch = async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path })
    if (method === 'GET' && path === '/api/admin/mentor-applications') return json(200, { success: true, data: APPS })
    if (method === 'POST' && /^\/api\/admin\/mentor-applications\/[^/]+\/resend-setup$/.test(path)) return resend()
    return json(404, { success: false })
  }
  return calls
}

const settle = async (n = 5) => {
  for (let i = 0; i < n; i++) await act(async () => new Promise((r) => setTimeout(r, 0)))
}

async function render() {
  const host = g.document.createElement('div')
  g.document.body.appendChild(host)
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ApplicationsPage />
      </QueryClientProvider>,
    ),
  )
  await settle()
  return {
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
      client.clear()
    },
  }
}

const resendButtons = () =>
  [...g.document.querySelectorAll('button')].filter((b: HTMLButtonElement) => b.textContent?.trim() === 'Resend setup link') as HTMLButtonElement[]
const resendFor = (name: string) => g.document.querySelector(`button[aria-label="Resend setup link to ${name}"]`) as HTMLButtonElement | null

async function click(el: HTMLElement) {
  await act(async () => el.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })))
}

describe('canResendSetup', () => {
  it('is true only for approved applications without an account', () => {
    expect(canResendSetup({ status: 'approved', hasAccount: false })).toBe(true)
    expect(canResendSetup({ status: 'approved', hasAccount: true })).toBe(false)
    expect(canResendSetup({ status: 'pending', hasAccount: false })).toBe(false)
    expect(canResendSetup({ status: 'rejected', hasAccount: false })).toBe(false)
  })
})

describe('Resend setup link on Mentor Applications', () => {
  it('shows the button only on the approved mentor who has not set up an account', async () => {
    stubApi(() => json(200, {}))
    const v = await render()
    expect(resendButtons()).toHaveLength(1)
    expect(resendFor('Waiting Mentor')).not.toBeNull()
    expect(resendFor('Active Mentor')).toBeNull()
    expect(resendFor('Pending Person')).toBeNull()
    expect(resendFor('Rejected Person')).toBeNull()
    await v.unmount()
  })

  it('calls the resend route once, disabled while pending, and toasts the address', async () => {
    let release!: (r: Response) => void
    const calls = stubApi(() => new Promise<Response>((r) => (release = r)))
    const success = spyOn(toast, 'success').mockImplementation(() => 0 as any)
    try {
      const v = await render()
      const button = resendFor('Waiting Mentor')!
      await click(button)
      expect(button.disabled).toBe(true)
      expect(button.getAttribute('aria-busy')).toBe('true')
      await click(button) // a second click while the first is in flight sends nothing
      const posts = calls.filter((c) => c.method === 'POST')
      expect(posts).toEqual([{ method: 'POST', path: '/api/admin/mentor-applications/a-waiting/resend-setup' }])

      await act(async () => release(json(200, { success: true, data: { email: 'waiting@example.test', emailQueued: true, expiresAt: '2026-11-22T10:00:00Z' } })))
      await settle()
      expect(success).toHaveBeenCalledWith('Setup link sent to waiting@example.test')
      expect(resendFor('Waiting Mentor')!.disabled).toBe(false)
      await v.unmount()
    } finally {
      success.mockRestore()
    }
  })

  it("shows the server's message when the resend is refused", async () => {
    stubApi(() =>
      json(429, {
        success: false,
        error: { code: 'RESEND_TOO_SOON', message: 'A setup link was sent less than a minute ago. Please wait a moment before sending another.' },
      }),
    )
    const error = spyOn(toast, 'error').mockImplementation(() => 0 as any)
    try {
      const v = await render()
      await click(resendFor('Waiting Mentor')!)
      await settle()
      expect(error).toHaveBeenCalledWith('A setup link was sent less than a minute ago. Please wait a moment before sending another.')
      expect(resendFor('Waiting Mentor')!.disabled).toBe(false)
      await v.unmount()
    } finally {
      error.mockRestore()
    }
  })

  it('says so when the link was made but the email was not sent', async () => {
    stubApi(() => json(200, { success: true, data: { email: 'waiting@example.test', emailQueued: false, expiresAt: '2026-11-22T10:00:00Z' } }))
    const error = spyOn(toast, 'error').mockImplementation(() => 0 as any)
    const success = spyOn(toast, 'success').mockImplementation(() => 0 as any)
    try {
      const v = await render()
      await click(resendFor('Waiting Mentor')!)
      await settle()
      expect(success).not.toHaveBeenCalled()
      expect(error.mock.calls[0]?.[0]).toBe('A new setup link was created, but the email could not be sent')
      await v.unmount()
    } finally {
      error.mockRestore()
      success.mockRestore()
    }
  })
})
