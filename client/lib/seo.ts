import type { Metadata } from 'next'

/**
 * What search engines may see. robots.ts, sitemap.ts, the root layout's
 * metadataBase and the noindex layouts all read from here, so the lists agree.
 */

// The site's own origin. The client has no env var for it (FRONTEND_URL is the
// API's), so it is the production address, as metadataBase always was.
export const SITE_URL = 'https://hadafi.potential.org'

// Signed-in areas, the API and one-off email links. Kept out of crawling here
// and marked noindex on the pages themselves (and by X-Robots-Tag in
// next.config.ts). /login is deliberately not listed: a crawler has to fetch it
// to see its noindex, or an already indexed /login never drops out.
export const PRIVATE_PATHS = ['/dashboard', '/admin', '/mentor', '/partner', '/api', '/unsubscribe']

// AI search and user-fetch bots: allowed on the public pages, so the
// programme can be found and cited in ChatGPT, Claude and Perplexity answers.
export const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot']

// For login, invite set-up pages and everything behind sign-in: out of search
// results, but links on them may still be followed.
export const NOINDEX: Metadata['robots'] = { index: false, follow: true }

export function siteUrl(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`
}
