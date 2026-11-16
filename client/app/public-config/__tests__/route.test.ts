import { afterEach, describe, expect, it } from 'bun:test'
import { GET, dynamic } from '../route'

/**
 * The browser learns the GTM container id at run time from /public-config,
 * so changing GTM_CONTAINER_ID needs a restart, not a rebuild. Anything that
 * isn't a GTM-XXXX id is reported as unset (the kill switch).
 */
const saved = process.env.GTM_CONTAINER_ID
afterEach(() => {
  if (saved === undefined) delete process.env.GTM_CONTAINER_ID
  else process.env.GTM_CONTAINER_ID = saved
})

describe('GET /public-config', () => {
  it('is rendered per request, never cached', async () => {
    expect(dynamic).toBe('force-dynamic')
    process.env.GTM_CONTAINER_ID = 'GTM-TEST1234'
    const res = await GET()
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('reports a valid id', async () => {
    process.env.GTM_CONTAINER_ID = 'GTM-TEST1234'
    expect(await (await GET()).json()).toEqual({ gtmId: 'GTM-TEST1234' })
  })

  it('reports null when unset, empty or malformed', async () => {
    for (const v of [undefined, '', 'G-ZBLPYC3MYL', 'GTM-x"></script>']) {
      if (v === undefined) delete process.env.GTM_CONTAINER_ID
      else process.env.GTM_CONTAINER_ID = v
      expect(await (await GET()).json()).toEqual({ gtmId: null })
    }
  })
})
