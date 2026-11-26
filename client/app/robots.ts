import type { MetadataRoute } from 'next'
import { AI_SEARCH_BOTS, PRIVATE_PATHS, SITE_URL } from '@/lib/seo'

// Search engines may crawl the public pages only. Signed-in areas also send
// X-Robots-Tag: noindex (next.config.ts), so a link that leaks is not indexed.
//
// AI training crawlers (GPTBot, ClaudeBot, Google-Extended) are deliberately not
// named: whether to block them is a leadership decision still open, so until
// then they follow the default `*` rule like any other crawler.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      // AI search and user-fetch bots, named so the policy is explicit.
      { userAgent: AI_SEARCH_BOTS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
