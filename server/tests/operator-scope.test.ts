import { describe, it, expect } from 'bun:test'
import { OPERATOR_ROUTES, operatorRouteAllowed, routeShape } from '../auth/operatorScope'
import { app } from '../index'

/**
 * auth/operatorScope.ts: the method + path patterns an operator key may call
 * (Hadafi's equivalents of what the operator MCP's SMEEP adapter uses, and
 * what its Hadafi adapter is built against), everything else 403.
 */

const id = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
const other = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'

describe('operator route allowlist', () => {
  it('allows what the operator MCP calls', () => {
    const calls: Array<[string, string]> = [
      ['GET', '/api/admin/offers'],
      ['GET', `/api/offers/${id}`],
      ['POST', '/api/admin/offers'],
      ['PATCH', `/api/admin/offers/${id}`],
      ['DELETE', `/api/admin/offers/${id}`],
      ['GET', '/api/admin/announcements'],
      ['GET', '/api/admin/announcements/audience'],
      ['POST', '/api/admin/announcements'],
      ['POST', `/api/admin/announcements/${id}/end`],
      ['GET', '/api/live-events/admin'],
      ['GET', '/api/live-events/admin/zoom'],
      ['POST', '/api/live-events'],
      ['PATCH', `/api/live-events/${id}`],
      ['DELETE', `/api/live-events/${id}`],
      ['GET', `/api/live-events/${id}/bookings`],
      ['GET', `/api/live-events/${id}/bookings/export`],
      ['POST', `/api/live-events/${id}/zoom/resync`],
      ['GET', '/api/lms/admin/courses'],
      ['GET', `/api/lms/admin/courses/${id}`],
      ['POST', `/api/lms/admin/modules/${id}/units`],
      ['POST', `/api/lms/admin/assessments/${id}/questions/reorder`],
      ['DELETE', `/api/lms/admin/block-questions/${id}`],
      ['GET', '/api/admin/organisations'],
      ['GET', `/api/admin/organisations/${id}/dashboard`],
      ['POST', `/api/admin/organisations/${id}/learners`],
      ['DELETE', `/api/admin/organisations/${id}/learners/${other}`],
      ['GET', `/api/admin/organisations/${id}/partners`],
      ['DELETE', `/api/admin/organisations/${id}/partners/${other}`],
      ['GET', '/api/admin/needs-attention'],
      ['GET', '/api/admin/invites'],
      ['POST', '/api/admin/invites'],
      ['GET', '/api/admin/mentor-applications'],
      ['GET', '/api/admin/stakeholder-applications'],
      ['GET', '/api/media'],
      ['DELETE', '/api/media'],
      ['DELETE', `/api/media/${id}`],
      ['GET', '/api/admin/ai-reports'],
      ['PATCH', `/api/admin/ai-reports/${id}`],
      ['GET', '/api/admin/stats'],
      ['GET', '/api/admin/analytics/insights'],
      ['GET', '/api/admin/analytics/impact'],
      ['GET', '/api/admin/analytics/learning-gain'],
      ['GET', '/api/admin/analytics/stakeholder-trend-by-type'],
      ['GET', '/api/admin/ai/catalog'],
      ['POST', '/api/admin/ai/query'],
      ['PUT', `/api/admin/ai/dashboards/${id}`],
    ]
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, true])
  })

  it('refuses admin routes the operator MCP does not call', () => {
    const calls: Array<[string, string]> = [
      // Bulk exports (incl. the newsletter list) and the AI report download.
      ['GET', '/api/admin/exports/learners'],
      ['GET', '/api/admin/exports/newsletter'],
      ['GET', `/api/admin/organisations/${id}/exports/learners`],
      ['POST', '/api/admin/ai/report'],
      // AI generation, uploads, the Zoom host link, reviewer notes.
      ['POST', '/api/admin/quiz/generate'],
      ['POST', '/api/media/upload'],
      ['GET', `/api/live-events/${id}/zoom/start-url`],
      ['POST', `/api/admin/ai-reports/${id}/notes`],
      // Hadafi-only announcement edits (PUT can send): not in SMEEP's scope.
      ['PUT', `/api/admin/announcements/${id}`],
      ['DELETE', `/api/admin/announcements/${id}`],
      // Anything that hands out a login: the key would pick who gets it.
      ['POST', `/api/admin/organisations/${id}/partners`],
      ['POST', `/api/admin/mentor-applications/${id}/approve`],
      ['POST', `/api/admin/mentor-applications/${id}/reject`],
      // Learner, partner and account routes.
      ['GET', '/api/me/streak'],
      ['GET', '/api/account/me'],
      ['POST', '/api/account/set-password'],
      ['GET', '/api/account/copilot-token'],
      ['GET', '/api/partner/dashboard'],
      ['GET', '/api/lms/courses'],
    ]
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, false])
  })

  it('matches the method, not just the path', () => {
    expect(operatorRouteAllowed('GET', `/api/admin/offers/${id}`)).toBe(false)
    expect(operatorRouteAllowed('DELETE', '/api/admin/offers')).toBe(false)
    expect(operatorRouteAllowed('HEAD', '/api/admin/offers')).toBe(false)
    expect(operatorRouteAllowed('get', '/api/admin/offers')).toBe(true)
  })

  it('matches whole segments only', () => {
    expect(operatorRouteAllowed('GET', '/api/admin/offers/')).toBe(true) // Express's optional trailing slash
    expect(operatorRouteAllowed('GET', '/api/admin/offersx')).toBe(false)
    expect(operatorRouteAllowed('GET', '/api/admin/offers/extra')).toBe(false)
    expect(operatorRouteAllowed('PATCH', `/api/admin/offers/${id}/more`)).toBe(false)
    expect(operatorRouteAllowed('PATCH', '/api/admin/offers//')).toBe(false)
    expect(operatorRouteAllowed('GET', '/API/ADMIN/OFFERS')).toBe(true) // Express routes case-insensitively
  })

  it('every entry is a METHOD and an /api/ path', () => {
    for (const entry of OPERATOR_ROUTES) expect(entry).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\/[a-zA-Z0-9/:_-]+$/)
    expect(new Set(OPERATOR_ROUTES).size).toBe(OPERATOR_ROUTES.length)
  })
})

describe('every allowlisted route exists in Hadafi', () => {
  // Matches each entry against the real Express router tree, the way Express
  // dispatches a request, so an entry can't name a SMEEP route Hadafi doesn't
  // have (or one that was renamed or removed).
  type Layer = {
    route?: { _handlesMethod: (method: string) => boolean }
    handle?: { stack?: Layer[] }
    path?: string
    match: (path: string) => boolean
  }

  function served(stack: Layer[], method: string, path: string): boolean {
    for (const layer of stack) {
      if (!layer.match(path)) continue
      if (layer.route) {
        if (layer.route._handlesMethod(method)) return true
      } else if (layer.handle?.stack) {
        const rest = path.slice((layer.path ?? '').length) || '/'
        if (served(layer.handle.stack, method, rest.startsWith('/') ? rest : `/${rest}`)) return true
      }
    }
    return false
  }

  it('finds a route the app serves for each OPERATOR_ROUTES entry', () => {
    const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack
    const missing = OPERATOR_ROUTES.filter((entry) => {
      const [method, pattern] = entry.split(' ') as [string, string]
      return !served(stack, method, pattern.replace(/:[A-Za-z]+/g, id))
    })
    expect(missing).toEqual([])
    // The check itself finds nothing that isn't there.
    expect(served(stack, 'GET', '/api/admin/no-such-route')).toBe(false)
    expect(served(stack, 'POST', '/api/admin/stats')).toBe(false)
  })
})

describe('docs/operator-access.md', () => {
  it('lists exactly the allowlist, in order (the operator adapter is built against that table)', async () => {
    const doc = await Bun.file(new URL('../docs/operator-access.md', import.meta.url)).text()
    const rows = doc
      .split('\n')
      .filter((line) => /^\| \d+ \|/.test(line))
      .map((line) => {
        const cells = line.split('|').map((c) => c.trim())
        return `${cells[2]} ${cells[3]!.replace(/`/g, '')}`
      })
    expect(rows).toEqual([...OPERATOR_ROUTES])
  })
})

describe('route shape for logs', () => {
  it('keeps word segments and replaces ids, emails and anything else with :param', () => {
    expect(routeShape(`/api/admin/organisations/${id}/exports/learners`)).toBe('/api/admin/organisations/:param/exports/learners')
    expect(routeShape('/api/admin/users/someone@example.com')).toBe('/api/admin/users/:param')
    expect(routeShape('/api/admin/x/12345/john%20smith')).toBe('/api/admin/x/:param/:param')
  })
})
