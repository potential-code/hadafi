import { describe, expect, it } from 'bun:test'
import config from '../../next.config'

/**
 * Pages send only the origin as a referrer, to other sites and to this one,
 * so a token or invite-code URL never reaches document.referrer on a later
 * page (where tags read it) or another site's request logs.
 * (/api responses come from the API, whose helmet sends no-referrer.)
 */
describe('Referrer-Policy', () => {
  it('is strict-origin on every page response', async () => {
    const rules = (await config.headers!()) as { source: string; headers: { key: string; value: string }[] }[]
    const pages = rules.find((r) => r.source === '/((?!api/).*)')
    expect(pages).toBeDefined()
    const policy = pages!.headers.filter((h) => h.key.toLowerCase() === 'referrer-policy')
    expect(policy).toEqual([{ key: 'Referrer-Policy', value: 'strict-origin' }])
  })
})
