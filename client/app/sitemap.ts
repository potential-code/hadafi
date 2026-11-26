import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

// The public pages. Everything else is behind sign-in and kept out of search.
const lastModified = new Date()

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl('/'), lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: siteUrl('/sign-up'), lastModified, changeFrequency: 'monthly', priority: 0.6 },
  ]
}
